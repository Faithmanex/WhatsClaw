import express from 'express';
import cors from 'cors';
import { Server as SocketServer } from 'socket.io';
import http from 'http';
import fs from 'fs';
import path from 'path';
import makeWASocket, { DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import pino from 'pino';
import * as dotenv from 'dotenv';
import { CognitionEngine } from './core/CognitionEngine';
import { HistoryManager } from './utils/HistoryManager';
import { InstructionsManager } from './utils/InstructionsManager';
import { SkillManager } from './utils/SkillManager';
import { ContactManager } from './utils/ContactManager';
import { GeminiProvider } from './ai/GeminiProvider';
import { OpenAIProvider } from './ai/OpenAIProvider';
import { AnthropicProvider } from './ai/AnthropicProvider';
import { ProviderDefinition } from './config/providers';
import { providerRegistry } from './config/providerRegistry';
import { classifyAIError, friendlyAIErrorMessage } from './utils/aiError';
import { MessageSkill } from './skills/MessageSkill';
import { GroupSkill } from './skills/GroupSkill';
import { FileSkill } from './skills/FileSkill';
import { CommandSkill } from './skills/CommandSkill';
import { AccountSkill } from './skills/AccountSkill';
import { AIProvider, Message } from './types/ai';
import { Medulla } from './core/brain/Medulla';
import { sanitizeJid } from './utils/JidUtils';
import { runtimeConfig } from './config/runtimeConfig';
import { PERSONA_PROFILES } from './config/personas';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000');
const logger = pino({
    level: 'warn',
    transport: { target: 'pino-pretty', options: { colorize: true } },
});
const cognition = new CognitionEngine();
const historyManager = new HistoryManager();
const instructionsManager = new InstructionsManager();
const skillManager = new SkillManager();
const contactManager = new ContactManager();

// ── Express + Socket.IO ──
const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new SocketServer(server, { cors: { origin: '*' } });

// ── Global State ──
let currentQR: string | null = null;
let connectionStatus: string = 'disconnected';
let waSocket: any = null;
let bootLogged = false;
let medulla: Medulla | null = null;
let activeAIProvider: AIProvider | null = null;
let activeMessageSkill: MessageSkill | null = null;

function buildProvider(provider: ProviderDefinition, modelId: string, apiKey: string, timeoutMs?: number): AIProvider {
    switch (provider.protocol) {
        case 'anthropic':
            return new AnthropicProvider({ apiKey, modelId, baseUrl: provider.baseUrl, timeoutMs });
        case 'gemini':
            return new GeminiProvider({ apiKey, modelId, baseUrl: provider.baseUrl });
        case 'openai':
        default:
            return new OpenAIProvider({
                apiKey,
                modelId,
                baseUrl: provider.baseUrl,
                timeoutMs,
                extraBody: provider.extraBody,
            });
    }
}

function buildAIProviderFromConfig(): AIProvider {
    const providerId = runtimeConfig.get('AI_PROVIDER', 'nvidia');
    const provider = providerRegistry.getProvider(providerId);
    if (!provider) {
        throw new Error(
            `Unknown AI provider "${providerId}". Add it under Manage Providers in the dashboard, ` +
            `or set AI_PROVIDER to one of: ${providerRegistry.getAll().map((p) => p.id).join(', ')}`
        );
    }
    const modelId = providerRegistry.resolveModel(providerId, runtimeConfig.get('AI_MODEL'));
    const apiKey = runtimeConfig.get(provider.apiKeyEnvVar);
    if (!apiKey || apiKey === 'your_key_here') {
        throw new Error(`No API key configured for provider "${provider.name}" (${provider.apiKeyEnvVar})`);
    }
    return buildProvider(provider, modelId, apiKey);
}

function refreshAIProvider() {
    try {
        activeAIProvider = buildAIProviderFromConfig();
    } catch (err: any) {
        activeAIProvider = null;
        console.error(`AI provider setup failed: ${err?.message || err}`);
    }

    if (!bootLogged) {
        const providerId = runtimeConfig.get('AI_PROVIDER', 'nvidia');
        try {
            const modelId = providerRegistry.resolveModel(providerId, runtimeConfig.get('AI_MODEL'));
            console.log(`AI: ${providerId} → ${modelId}`);
        } catch (_) {}
        bootLogged = true;
    }

    if (waSocket && activeMessageSkill && activeAIProvider) {
        if (medulla) medulla.stopHeartbeat();
        medulla = new Medulla(waSocket, activeAIProvider, cognition, historyManager, activeMessageSkill);
        medulla.startHeartbeat(60000);
    }
}

// ── API Routes ──

const authenticateRequest = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const authHeader = req.headers.authorization;
    const token = runtimeConfig.get('DASHBOARD_TOKEN');

    // Only require auth if DASHBOARD_TOKEN is set in config/env
    if (!token) return next();

    if (!authHeader || authHeader !== `Bearer ${token}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

app.use('/api', authenticateRequest);

// Status
app.get('/api/status', (_req, res) => {
    const providerId = runtimeConfig.get('AI_PROVIDER', 'nvidia');
    let model = runtimeConfig.get('AI_MODEL') || '';
    try {
        model = model || providerRegistry.resolveModel(providerId);
    } catch (_) {}
    res.json({
        connection: connectionStatus,
        qr: currentQR,
        heartbeat: cognition.getHeartbeat(),
        provider: providerId,
        model,
    });
});

// Config CRUD
function maskSecrets(config: Record<string, string>): Record<string, string> {
    const out = { ...config };
    for (const key of Object.keys(out)) {
        if (/(_KEY|_TOKEN|_SECRET)$/.test(key) && out[key] && out[key] !== 'your_key_here') {
            out[key] = '••••••••';
        }
    }
    return out;
}

app.get('/api/config', (_req, res) => {
    res.json(maskSecrets(runtimeConfig.getAll()));
});

app.post('/api/config', (req, res) => {
    const body = req.body || {};
    if (body.AI_PROVIDER && !providerRegistry.getProvider(String(body.AI_PROVIDER))) {
        return res.status(400).json({ error: `Unknown AI provider: ${body.AI_PROVIDER}` });
    }
    const updated = runtimeConfig.update(body);
    refreshAIProvider();
    res.json({ ok: true, config: maskSecrets(updated) });
});

// Providers CRUD
app.get('/api/providers', (_req, res) => {
    res.json(providerRegistry.getAll());
});

app.post('/api/providers', (req, res) => {
    try {
        const provider = providerRegistry.addCustomProvider(req.body || {});
        if (req.body.apiKey) {
            runtimeConfig.update({ [provider.apiKeyEnvVar]: String(req.body.apiKey) });
        }
        refreshAIProvider();
        res.json({ ok: true, provider });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

app.put('/api/providers/:id', (req, res) => {
    try {
        const id = decodeURIComponent(req.params.id);
        const provider = providerRegistry.updateCustomProvider(id, req.body || {});
        if (req.body.apiKey) {
            runtimeConfig.update({ [provider.apiKeyEnvVar]: String(req.body.apiKey) });
        }
        refreshAIProvider();
        res.json({ ok: true, provider });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/api/providers/:id', (req, res) => {
    try {
        const id = decodeURIComponent(req.params.id);
        providerRegistry.removeCustomProvider(id);
        if (runtimeConfig.get('AI_PROVIDER') === id) {
            runtimeConfig.update({ AI_PROVIDER: 'nvidia', AI_MODEL: '' });
        }
        refreshAIProvider();
        res.json({ ok: true });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

// Test a provider connection (uses supplied key or the configured one)
app.post('/api/providers/test', async (req, res) => {
    const { id, apiKey, model } = req.body || {};
    const provider = providerRegistry.getProvider(String(id || ''));
    if (!provider) return res.status(400).json({ error: `Unknown provider: ${id}` });

    let resolvedModel = '';
    try {
        resolvedModel = String(model || '') || providerRegistry.resolveModel(provider.id, runtimeConfig.get('AI_MODEL'));
    } catch (err: any) {
        return res.status(400).json({ error: err.message });
    }

    const key = String(apiKey || '') || runtimeConfig.get(provider.apiKeyEnvVar);
    if (!key || key === 'your_key_here') {
        return res.status(400).json({ error: `No API key configured for ${provider.name} (${provider.apiKeyEnvVar})` });
    }

    try {
        const started = Date.now();
        const testProvider = buildProvider(provider, resolvedModel, key, 15000);
        await testProvider.generateResponse(
            [{ role: 'system', content: 'You are a connectivity test.' }],
            'Reply with exactly: OK'
        );
        res.json({ ok: true, provider: provider.id, model: resolvedModel, latencyMs: Date.now() - started });
    } catch (err: any) {
        const status = err?.status || err?.statusCode || err?.response?.status;
        res.status(400).json({ ok: false, provider: provider.id, model: resolvedModel, error: err?.message || String(err), status });
    }
});

// Models registry
app.get('/api/models', (_req, res) => {
    const registry: Record<string, unknown> = {};
    for (const provider of providerRegistry.getAll()) {
        registry[provider.id] = provider.models;
    }
    res.json(registry);
});

app.get('/api/models/:provider', (req, res) => {
    res.json(providerRegistry.getModelsForProvider(req.params.provider));
});

app.get('/api/personas', (_req, res) => {
    res.json(PERSONA_PROFILES);
});

// Instructions CRUD
app.get('/api/instructions', (_req, res) => {
    const dir = 'instructions';
    if (!fs.existsSync(dir)) return res.json([]);
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.txt'));
    const list = files.map(f => ({
        jid: f.replace('.txt', '').replace(/_/g, '@'),
        text: fs.readFileSync(path.join(dir, f), 'utf-8').trim(),
    }));
    res.json(list);
});

app.post('/api/instructions', async (req, res) => {
    const { jid, text } = req.body;
    if (!jid || !text) return res.status(400).json({ error: 'jid and text required' });
    await instructionsManager.saveInstruction(jid, text);
    res.json({ ok: true });
});

app.delete('/api/instructions/:jid', (req, res) => {
    const jid = decodeURIComponent(req.params.jid);
    const filePath = path.join('instructions', `${jid.replace(/[:@]/g, '_')}.txt`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ ok: true });
});

// Skills list
app.get('/api/skills', async (_req, res) => {
    const dir = 'skills';
    if (!fs.existsSync(dir)) return res.json([]);
    const folders = fs.readdirSync(dir);
    const skills = folders
        .filter(f => fs.existsSync(path.join(dir, f, 'SKILL.md')))
        .map(f => ({
            name: f,
            content: fs.readFileSync(path.join(dir, f, 'SKILL.md'), 'utf-8'),
        }));
    res.json(skills);
});

// Contacts API
app.get('/api/contacts', (_req, res) => {
    res.json(contactManager.getAllContacts());
});

app.post('/api/contacts', (req, res) => {
    const { jid, name } = req.body;
    if (!jid || !name) return res.status(400).json({ error: 'jid and name required' });
    contactManager.saveContact(jid, name);
    res.json({ ok: true });
});

app.delete('/api/contacts/:jid', (req, res) => {
    const jid = decodeURIComponent(req.params.jid);
    try {
        contactManager.deleteContact(jid);
        res.json({ ok: true });
    } catch(e: any) {
        res.status(500).json({ error: e.message });
    }
});

// Broadcast/Campaigns API
app.post('/api/broadcast', async (req, res) => {
    if (!waSocket) return res.status(503).json({ error: 'Not connected' });
    const { jids, message } = req.body;
    if (!jids || !Array.isArray(jids) || !message) {
        return res.status(400).json({ error: 'jids array and message required' });
    }

    let successCount = 0;
    const errors: any[] = [];

    for (const jid of jids) {
        try {
            const sanitizedJid = sanitizeJid(jid);
            const sentMsg = await waSocket.sendMessage(sanitizedJid, { text: message });

            if (sentMsg) {
                const rawHistory = await historyManager.getHistory(sanitizedJid);
                rawHistory.push(sentMsg);
                await historyManager.saveHistory(sanitizedJid, rawHistory);
                io.emit('chat_message', { jid: sanitizedJid, message: sentMsg });
            }

            successCount++;
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err: any) {
            errors.push({ jid, error: err.message });
        }
    }

    res.json({ ok: true, successCount, total: jids.length, errors });
});

// Chat History API
app.get('/api/chats', async (req, res) => {
    try {
        const dir = 'histories';
        if (!fs.existsSync(dir)) return res.json([]);
        const folders = fs.readdirSync(dir);
        const chats = [];
        for (const f of folders) {
            const jid = f.replace(/_/g, '@');
            const history = await historyManager.getHistory(jid);
            const lastMessage = history.length > 0 ? history[history.length - 1] : null;
            chats.push({
                jid,
                name: contactManager.getContactName(jid) || jid.split('@')[0],
                lastMessage
            });
        }
        res.json(chats);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/history/:jid', async (req, res) => {
    try {
        const jid = decodeURIComponent(req.params.jid);
        const history = await historyManager.getHistory(jid);
        res.json(history);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Send message to a contact
app.post('/api/send', async (req, res) => {
    if (!waSocket) return res.status(503).json({ error: 'Not connected' });
    const { number, message } = req.body;
    if (!number || !message) return res.status(400).json({ error: 'number and message required' });
    try {
        const jid = number.includes('@') ? number : `${number}@s.whatsapp.net`;
        const sentMsg = await waSocket.sendMessage(jid, { text: message });

        if (sentMsg) {
            const rawHistory = await historyManager.getHistory(jid);
            rawHistory.push(sentMsg);
            await historyManager.saveHistory(jid, rawHistory);
            io.emit('chat_message', { jid, message: sentMsg });
        }

        res.json({ ok: true, jid });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Create group
app.post('/api/groups', async (req, res) => {
    if (!waSocket) return res.status(503).json({ error: 'Not connected' });
    const { name, participants } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    try {
        const jids = (participants || []).map((p: string) => p.includes('@') ? p : `${p}@s.whatsapp.net`);
        const result = await waSocket.groupCreate(name, jids);
        res.json({ ok: true, group: result });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Pair with phone
app.post('/api/pair', async (req, res) => {
    if (!waSocket) return res.status(503).json({ error: 'Not connected' });
    const { number } = req.body;
    if (!number) return res.status(400).json({ error: 'number required' });
    try {
        const cleanNumber = number.replace(/[^0-9]/g, '');
        const code = await waSocket.requestPairingCode(cleanNumber);
        res.json({ ok: true, code });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Logout
app.post('/api/logout', async (_req, res) => {
    try {
        if (waSocket) {
            try { waSocket.end(undefined); } catch (_) {}
            waSocket = null;
        }
        const authDir = 'auth_info_baileys';
        if (fs.existsSync(authDir)) {
            fs.rmSync(authDir, { recursive: true, force: true });
        }
        currentQR = null;
        connectionStatus = 'disconnected';
        io.emit('status', 'disconnected');
        setTimeout(() => connectToWhatsApp(), 1000);
    } catch (_e) {}
    res.json({ ok: true });
});

// Serve frontend
app.use(express.static(path.join(__dirname, '..', 'frontend', 'dist')));

app.use((_req, res, next) => {
    if (_req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API route not found' });
    }
    res.sendFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
});

// ── WhatsApp Connection ──
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger,
        browser: ['Ubuntu', 'Chrome', '20.0.04'],
    });
    waSocket = sock;

    activeMessageSkill = new MessageSkill(sock);
    refreshAIProvider();

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            if (qr !== currentQR) {
                currentQR = qr;
                connectionStatus = 'qr';
                io.emit('qr', qr);
                io.emit('status', 'qr');
            }
        }
        if (connection === 'close') {
            currentQR = null;
            connectionStatus = 'disconnected';
            io.emit('status', 'disconnected');
            const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
            if (statusCode === DisconnectReason.loggedOut) {
                const authDir = 'auth_info_baileys';
                if (fs.existsSync(authDir)) {
                    fs.rmSync(authDir, { recursive: true, force: true });
                }
                setTimeout(() => connectToWhatsApp(), 1000);
            } else {
                setTimeout(() => connectToWhatsApp(), 5000);
            }
        } else if (connection === 'open') {
            currentQR = null;
            connectionStatus = 'connected';
            io.emit('status', 'connected');
            console.log('Antigravity is online.');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        if (m.type !== 'notify' && m.type !== 'append') return;
        for (const msg of m.messages) {
            if (!msg.message) continue;

            const remoteJid = sanitizeJid(msg.key.remoteJid!);

            // 1. If message is sent by the user themselves (or the AI on their behalf),
            // we save it to history so the AI has context of what "You" said, but we don't reply to it.
            if (msg.key.fromMe) {
                await historyManager.appendIfMissing(remoteJid, msg);
                io.emit('chat_message', { jid: remoteJid, message: msg });
                continue;
            }

            // 1.5 If it's an appended message (e.g. historical sync from another device)
            // Save it to history to build context, but do NOT trigger an AI response.
            if (m.type === 'append') {
                await historyManager.appendIfMissing(remoteJid, msg);
                io.emit('chat_message', { jid: remoteJid, message: msg });
                continue;
            }

            // 2. Process incoming new messages
            const isGroup = remoteJid.endsWith('@g.us');
            const senderNumber = remoteJid.split('@')[0];

            const groupPolicy = runtimeConfig.get('WHATSAPP_GROUP_POLICY', 'disabled');
            if (isGroup && groupPolicy === 'disabled') continue;

            if (!isGroup) {
                const dmPolicy = runtimeConfig.get('WHATSAPP_DM_POLICY', 'open');
                if (dmPolicy === 'disabled') continue;
                if (dmPolicy === 'allowlist') {
                    const allowList = runtimeConfig.get('WHATSAPP_ALLOW_FROM').split(',').map(n => n.trim()).filter(Boolean);
                    if (!allowList.includes(senderNumber)) continue;
                }
            }

            // Auto-save known display names to contacts list
            if (msg.pushName) {
                const senderId = sanitizeJid(msg.key.participant || remoteJid);
                if (!contactManager.getContactName(senderId)) {
                    contactManager.saveContact(senderId, msg.pushName);
                    console.log(`📇 [Contacts] Auto-saved: ${msg.pushName} (${senderId})`);
                }
            }

            if (runtimeConfig.get('WHATSAPP_READ_RECEIPTS', 'true') === 'true') {
                await sock.readMessages([msg.key]);
            }

            const body = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
            if (!body) continue;

            // Mention trigger filter
            const mentionTrigger = runtimeConfig.get('WHATSAPP_MENTION_TRIGGER');
            if (mentionTrigger && !body.toLowerCase().includes(mentionTrigger.toLowerCase())) continue;

            try {
                cognition.processEmotion(body);
                const limit = parseInt(runtimeConfig.get('HISTORY_LIMIT', '30'));
                // Save incoming first so this message immediately becomes part of this chat's history.
                const rawHistory = await historyManager.appendIfMissing(remoteJid, msg);
                io.emit('chat_message', { jid: remoteJid, message: msg });

                // Build context summary — inject as system prompt, NOT as conversation turns
                const recentMessages = rawHistory.slice(-limit).map(h => {
                    const sender = sanitizeJid(h.key.participant || h.key.remoteJid || remoteJid);
                    const name = contactManager.getContactName(sender) || sender.split('@')[0];
                    const who = h.key.fromMe ? 'You' : name;
                    const text = h.message?.conversation || h.message?.extendedTextMessage?.text || '';
                    const ts = h.messageTimestamp ? new Date(Number(h.messageTimestamp) * 1000).toISOString() : '';
                    return text ? `[${ts || 'unknown-time'}] ${who}: ${text}` : '';
                }).filter(Boolean).join('\n');
                
                if (medulla) medulla.recordInteraction(remoteJid);

                if (!activeMessageSkill || !activeAIProvider) continue;
                await activeMessageSkill.sendTyping(remoteJid);

                const personaName = runtimeConfig.get('PERSONA_NAME', 'Antigravity');
                const personaProfile = runtimeConfig.get('PERSONA_PROFILE', 'street-smart');
                let systemPrompt = cognition.getSystemPrompt(remoteJid, body, personaName, personaProfile);
                const globalSkills = await skillManager.getAllSkills();
                systemPrompt += `\n\n${globalSkills}`;
                
                const senderId = msg.key.participant || remoteJid;
                const contactName = contactManager.getContactName(senderId);
                if (contactName) {
                    systemPrompt += `\n\n[USER IDENTITY]\nYou are currently talking to: ${contactName}. Use their name naturally.`;
                }

                systemPrompt += `\n\n[CHAT CONTEXT]\n- Current chat id: ${remoteJid}\n- Chat type: ${isGroup ? 'group' : 'direct'}\n- Keep continuity with this chat's own history only.\n- Avoid generic replies; reference recent details, names, and ongoing threads from this specific chat when relevant.`;

                const customInstruction = await instructionsManager.getInstruction(remoteJid);
                if (customInstruction) {
                    systemPrompt += `\n\n[SPECIAL INSTRUCTIONS FOR THIS CHAT]:\n${customInstruction}`;
                }

                if (recentMessages) {
                    systemPrompt += `\n\n[CONVERSATION HISTORY — for context only, do NOT repeat or re-answer these]:\n${recentMessages}`;
                }

                const response = await activeAIProvider.generateResponse(
                    [{ role: 'system', content: systemPrompt }],
                    body
                );

                // ── Action Parser ──
                function extractJSON(text: string) {
                    const results = [];
                    let start = text.indexOf('{');
                    while (start !== -1) {
                        if (text.substring(start).includes('"action"')) {
                            let braceCount = 0;
                            for (let i = start; i < text.length; i++) {
                                if (text[i] === '{') braceCount++;
                                if (text[i] === '}') braceCount--;
                                if (braceCount === 0) {
                                    results.push(text.substring(start, i + 1));
                                    start = text.indexOf('{', i);
                                    break;
                                }
                                if (i === text.length - 1) start = -1; // No closing brace
                            }
                        } else {
                            start = text.indexOf('{', start + 1);
                        }
                    }
                    return results;
                }

                // Filter out <think> tags completely so reasoning models don't dump nonsense into chat
                const cleanTextWithoutThink = response.replace(/<think>[\s\S]*?<\/think>\n?/g, '').trim();
                const actions = extractJSON(cleanTextWithoutThink);
                let cleanResponse = cleanTextWithoutThink;

                if (actions.length > 0) {
                    for (const actionStr of actions) {
                        try {
                            const action = JSON.parse(actionStr);
                            cleanResponse = cleanResponse.replace(actionStr, '').trim();

                            switch (action.action) {
                                case 'react':
                                    await activeMessageSkill.react(remoteJid, msg.key, action.params.emoji);
                                    break;
                                case 'sendText': {
                                    const target = action.params.jid || remoteJid;
                                    const sentActionMsg = await activeMessageSkill.sendText(target, action.params.text);
                                    if (sentActionMsg && target === remoteJid) {
                                        rawHistory.push(sentActionMsg);
                                        await historyManager.saveHistory(remoteJid, rawHistory);
                                        io.emit('chat_message', { jid: target, message: sentActionMsg });
                                    }
                                    break;
                                }
                                case 'sendTyping':
                                    await activeMessageSkill.sendTyping(action.params.jid || remoteJid, action.params.duration || 2000);
                                    break;
                                case 'createGroup': {
                                    const groupSkill = new GroupSkill(sock);
                                    await groupSkill.createGroup(action.params.name, action.params.participants || []);
                                    break;
                                }
                                case 'promote': {
                                    const groupSkill = new GroupSkill(sock);
                                    await groupSkill.promote(action.params.groupId || remoteJid, action.params.participants || [action.params.jid]);
                                    break;
                                }
                                case 'demote': {
                                    const groupSkill = new GroupSkill(sock);
                                    await groupSkill.demote(action.params.groupId || remoteJid, action.params.participants || [action.params.jid]);
                                    break;
                                }
                                case 'add': {
                                    const groupSkill = new GroupSkill(sock);
                                    await groupSkill.add(action.params.groupId || remoteJid, action.params.participants || [action.params.jid]);
                                    break;
                                }
                                case 'remove': {
                                    const groupSkill = new GroupSkill(sock);
                                    await groupSkill.remove(action.params.groupId || remoteJid, action.params.participants || [action.params.jid]);
                                    break;
                                }
                                case 'inviteLink': {
                                    const groupSkill = new GroupSkill(sock);
                                    const code = await groupSkill.inviteLink(action.params.groupId || remoteJid);
                                    await activeMessageSkill.sendText(remoteJid, `https://chat.whatsapp.com/${code}`, msg);
                                    break;
                                }
                                case 'updateStatus': {
                                    const accountSkill = new AccountSkill(sock);
                                    await accountSkill.updateStatus(action.params.status);
                                    break;
                                }
                                case 'setPresence': {
                                    const accountSkill = new AccountSkill(sock);
                                    await accountSkill.setPresence(action.params.presence);
                                    break;
                                }
                                case 'readFile': {
                                    const fileReadSkill = new FileSkill(sock);
                                    await fileReadSkill.readFile(remoteJid, action.params.path, msg.key);
                                    break;
                                }
                                case 'editFile': {
                                    const fileEditSkill = new FileSkill(sock);
                                    await fileEditSkill.editFile(remoteJid, action.params.path, action.params.content, msg.key);
                                    break;
                                }
                                case 'executeCommand': {
                                    const commandSkill = new CommandSkill(sock);
                                    await commandSkill.executeCommand(remoteJid, action.params.command, msg.key);
                                    break;
                                }
                                case 'storeMemory':
                                    cognition.hippocampus.commitToLongTermMemory(remoteJid, action.params.fact, action.params.context || 'manual-store', action.params.tags || [], action.params.importance || 0.8);
                                    console.log(`🧠 [Hippocampus] Stored new fact for ${remoteJid}: ${action.params.fact}`);
                                    break;
                                case 'saveContact':
                                    contactManager.saveContact(action.params.jid, action.params.name);
                                    console.log(`📇 [Contacts] Saved: ${action.params.name} (${action.params.jid})`);
                                    break;
                            }
                        } catch (e: any) {
                            console.error(`Failed to parse/execute action: ${actionStr}\nError: ${e.message}`);
                        }
                    }
                }

                // Only send text if there's remaining non-JSON content
                if (!cleanResponse && actions.length === 0) {
                    cleanResponse = '⚠️ I drew a blank there — try asking me again.';
                }
                if (cleanResponse) {
                    const sentCleanMsg = await activeMessageSkill.sendText(remoteJid, cleanResponse, msg);
                    if (sentCleanMsg) {
                        rawHistory.push(sentCleanMsg);
                        await historyManager.saveHistory(remoteJid, rawHistory);
                        io.emit('chat_message', { jid: remoteJid, message: sentCleanMsg });
                    }
                }
            } catch (error: any) {
                const providerId = runtimeConfig.get('AI_PROVIDER', '');
                const providerName = providerRegistry.getProvider(providerId)?.name || providerId || 'AI provider';
                const info = classifyAIError(error);
                const errText = friendlyAIErrorMessage(info, providerName);
                console.error(`[AI:${providerName}] ${info.category}${info.httpStatus ? ` (HTTP ${info.httpStatus})` : ''}: ${info.detail}`);
                if (activeMessageSkill) {
                    try {
                        await activeMessageSkill.sendText(remoteJid, errText, msg);
                    } catch (sendErr: any) {
                        console.error('Failed to send error notification:', sendErr?.message);
                    }
                }
            }
        }
    });
}

// ── Boot ──
server.listen(PORT, () => {
    console.log(`Dashboard: http://localhost:${PORT}`);
    connectToWhatsApp().catch(err => console.error('Critical:', err));
});

process.on('uncaughtException', (err) => console.error('Uncaught:', err));
process.on('unhandledRejection', (err) => console.error('Unhandled:', err));
