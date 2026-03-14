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
import { resolveModel, MODEL_REGISTRY, getModelsForProvider } from './config/models';
import { MessageSkill } from './skills/MessageSkill';
import { GroupSkill } from './skills/GroupSkill';
import { FileSkill } from './skills/FileSkill';
import { CommandSkill } from './skills/CommandSkill';
import { AccountSkill } from './skills/AccountSkill';
import { AIProvider, Message } from './types/ai';
import { Medulla } from './core/brain/Medulla';
import { sanitizeJid } from './utils/JidUtils';
import { runtimeConfig } from './config/runtimeConfig';

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

function buildAIProviderFromConfig(): AIProvider {
    const providerType = runtimeConfig.get('AI_PROVIDER', 'gemini');
    const modelId = resolveModel(providerType, runtimeConfig.get('AI_MODEL'));

    switch (providerType) {
        case 'openai':
            return new OpenAIProvider(runtimeConfig.get('OPENAI_API_KEY'), modelId);
        case 'anthropic':
            return new AnthropicProvider(runtimeConfig.get('ANTHROPIC_API_KEY'), modelId);
        default:
            return new GeminiProvider(runtimeConfig.get('GEMINI_API_KEY'), modelId);
    }
}

function refreshAIProvider() {
    activeAIProvider = buildAIProviderFromConfig();

    if (!bootLogged) {
        const providerType = runtimeConfig.get('AI_PROVIDER', 'gemini');
        const modelId = resolveModel(providerType, runtimeConfig.get('AI_MODEL'));
        console.log(`AI: ${providerType} → ${modelId}`);
        bootLogged = true;
    }

    if (waSocket && activeMessageSkill && activeAIProvider) {
        if (medulla) medulla.stopHeartbeat();
        medulla = new Medulla(waSocket, activeAIProvider, cognition, historyManager, activeMessageSkill);
        medulla.startHeartbeat(60000);
    }
}

// ── API Routes ──

// Status
app.get('/api/status', (_req, res) => {
    res.json({
        connection: connectionStatus,
        qr: currentQR,
        heartbeat: cognition.getHeartbeat(),
        provider: runtimeConfig.get('AI_PROVIDER', 'gemini'),
        model: runtimeConfig.get('AI_MODEL') || resolveModel(runtimeConfig.get('AI_PROVIDER', 'gemini')),
    });
});

// Config CRUD
app.get('/api/config', (_req, res) => {
    res.json(runtimeConfig.getAll());
});

app.post('/api/config', (req, res) => {
    const updated = runtimeConfig.update(req.body || {});
    refreshAIProvider();
    res.json({ ok: true, config: updated });
});

// Models registry
app.get('/api/models', (_req, res) => {
    res.json(MODEL_REGISTRY);
});

app.get('/api/models/:provider', (req, res) => {
    res.json(getModelsForProvider(req.params.provider));
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

// Send message to a contact
app.post('/api/send', async (req, res) => {
    if (!waSocket) return res.status(503).json({ error: 'Not connected' });
    const { number, message } = req.body;
    if (!number || !message) return res.status(400).json({ error: 'number and message required' });
    try {
        const jid = number.includes('@') ? number : `${number}@s.whatsapp.net`;
        await waSocket.sendMessage(jid, { text: message });
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

// Serve dashboard
app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dashboard', 'index.html'));
});
app.use('/assets', express.static(path.join(__dirname, '..', 'dashboard', 'assets')));

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
                continue;
            }

            // 1.5 If it's an appended message (e.g. historical sync from another device)
            // Save it to history to build context, but do NOT trigger an AI response.
            if (m.type === 'append') {
                await historyManager.appendIfMissing(remoteJid, msg);
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
                cognition.hippocampus.extractAndStoreFromMessage(remoteJid, body);
                const limit = parseInt(runtimeConfig.get('HISTORY_LIMIT', '30'));
                // Save incoming first so this message immediately becomes part of this chat's history.
                const rawHistory = await historyManager.appendIfMissing(remoteJid, msg);

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

                let systemPrompt = cognition.getSystemPrompt(remoteJid, body);
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

                const actions = extractJSON(response);
                let cleanResponse = response;

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
                if (cleanResponse) {
                    const sentCleanMsg = await activeMessageSkill.sendText(remoteJid, cleanResponse, msg);
                    if (sentCleanMsg) {
                        rawHistory.push(sentCleanMsg);
                        await historyManager.saveHistory(remoteJid, rawHistory);
                    }
                }
            } catch (error: any) {
                const status = error?.status || error?.statusCode || error?.response?.status;
                const errMsg = error?.message || '';
                if (status === 429 || errMsg.toLowerCase().includes('rate limit') || errMsg.toLowerCase().includes('quota')) {
                    console.error(`⚠️  RATE LIMITED by ${runtimeConfig.get('AI_PROVIDER', 'gemini')}. Slow down or upgrade your plan.`);
                    if (activeMessageSkill) {
                        await activeMessageSkill.sendText(remoteJid, '⏳ I\'m being rate limited right now. Try again in a moment.', msg);
                    }
                } else {
                    console.error('Message error:', error);
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
