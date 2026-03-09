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
import { AIProvider, Message } from './types/ai';
import { Medulla } from './core/brain/Medulla';
import { sanitizeJid } from './utils/JidUtils';

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

// ── .env read/write helpers ──
const ENV_PATH = path.resolve('.env');

function readEnv(): Record<string, string> {
    if (!fs.existsSync(ENV_PATH)) return {};
    const raw = fs.readFileSync(ENV_PATH, 'utf-8');
    const env: Record<string, string> = {};
    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) continue;
        env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
    }
    return env;
}

function writeEnv(env: Record<string, string>) {
    const lines = Object.entries(env).map(([k, v]) => `${k}=${v}`);
    fs.writeFileSync(ENV_PATH, lines.join('\n') + '\n');
}

// ── API Routes ──

// Status
app.get('/api/status', (_req, res) => {
    res.json({
        connection: connectionStatus,
        qr: currentQR,
        heartbeat: cognition.getHeartbeat(),
        provider: process.env.AI_PROVIDER || 'gemini',
        model: process.env.AI_MODEL || resolveModel(process.env.AI_PROVIDER || 'gemini'),
    });
});

// Config CRUD
app.get('/api/config', (_req, res) => {
    const env = readEnv();
    res.json(env);
});

app.post('/api/config', (req, res) => {
    const current = readEnv();
    const updated = { ...current, ...req.body };
    writeEnv(updated);
    // Sync process.env
    for (const [k, v] of Object.entries(updated)) {
        process.env[k] = v as string;
    }
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
        browser: ['Antigravity OS', 'Chrome', '1.0.0'],
    });
    waSocket = sock;

    const msgSkill = new MessageSkill(sock);

    const providerType = process.env.AI_PROVIDER || 'gemini';
    const modelId = resolveModel(providerType, process.env.AI_MODEL);
    let aiProvider: AIProvider;

    switch (providerType) {
        case 'openai':
            aiProvider = new OpenAIProvider(process.env.OPENAI_API_KEY || '', modelId);
            break;
        case 'anthropic':
            aiProvider = new AnthropicProvider(process.env.ANTHROPIC_API_KEY || '', modelId);
            break;
        default:
            aiProvider = new GeminiProvider(process.env.GEMINI_API_KEY || '', modelId);
    }
    if (!bootLogged) {
        console.log(`AI: ${providerType} → ${modelId}`);
        bootLogged = true;
    }

    if (medulla) medulla.stopHeartbeat();
    medulla = new Medulla(sock, aiProvider, cognition, historyManager, msgSkill);
    medulla.startHeartbeat(60000); // Check for proactive triggers every 60s

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
                const history = await historyManager.getHistory(remoteJid);
                if (!history.some(h => h.key.id === msg.key.id)) {
                    history.push(msg);
                    await historyManager.saveHistory(remoteJid, history);
                }
                continue;
            }

            // 1.5 If it's an appended message (e.g. historical sync from another device)
            // Save it to history to build context, but do NOT trigger an AI response.
            if (m.type === 'append') {
                const history = await historyManager.getHistory(remoteJid);
                if (!history.some(h => h.key.id === msg.key.id)) {
                    history.push(msg);
                    await historyManager.saveHistory(remoteJid, history);
                }
                continue;
            }

            // 2. Process incoming new messages
            const isGroup = remoteJid.endsWith('@g.us');
            const senderNumber = remoteJid.split('@')[0];

            const groupPolicy = process.env.WHATSAPP_GROUP_POLICY || 'disabled';
            if (isGroup && groupPolicy === 'disabled') continue;

            if (!isGroup) {
                const dmPolicy = process.env.WHATSAPP_DM_POLICY || 'open';
                if (dmPolicy === 'disabled') continue;
                if (dmPolicy === 'allowlist') {
                    const allowList = (process.env.WHATSAPP_ALLOW_FROM || '').split(',').map(n => n.trim());
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

            if (process.env.WHATSAPP_READ_RECEIPTS === 'true') {
                await sock.readMessages([msg.key]);
            }

            const body = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
            if (!body) continue;

            // Mention trigger filter
            const mentionTrigger = process.env.WHATSAPP_MENTION_TRIGGER;
            if (mentionTrigger && !body.toLowerCase().includes(mentionTrigger.toLowerCase())) continue;

            try {
                cognition.processEmotion(body);
                const limit = parseInt(process.env.HISTORY_LIMIT || '30');
                const rawHistory = await historyManager.getHistory(remoteJid);

                // Build context summary — inject as system prompt, NOT as conversation turns
                const recentMessages = rawHistory.slice(-limit).map(h => {
                    const sender = h.key.participant || h.key.remoteJid!;
                    const name = contactManager.getContactName(sender) || sender.split('@')[0];
                    const who = h.key.fromMe ? 'You' : name;
                    const text = h.message?.conversation || h.message?.extendedTextMessage?.text || '';
                    return `${who}: ${text}`;
                }).filter(line => line.endsWith(': ') === false).join('\n');

                // Save the incoming message immediately so that any replies we generate
                // get appended *after* this message in the history.
                rawHistory.push(msg);
                await historyManager.saveHistory(remoteJid, rawHistory);
                
                if (medulla) medulla.recordInteraction(remoteJid);

                await msgSkill.sendTyping(remoteJid);

                let systemPrompt = cognition.getSystemPrompt(remoteJid);
                const globalSkills = await skillManager.getAllSkills();
                systemPrompt += `\n\n${globalSkills}`;
                
                const senderId = msg.key.participant || remoteJid;
                const contactName = contactManager.getContactName(senderId);
                if (contactName) {
                    systemPrompt += `\n\n[USER IDENTITY]\nYou are currently talking to: ${contactName}. Use their name naturally.`;
                }

                const customInstruction = await instructionsManager.getInstruction(remoteJid);
                if (customInstruction) {
                    systemPrompt += `\n\n[SPECIAL INSTRUCTIONS FOR THIS CHAT]:\n${customInstruction}`;
                }

                if (recentMessages) {
                    systemPrompt += `\n\n[CONVERSATION HISTORY — for context only, do NOT repeat or re-answer these]:\n${recentMessages}`;
                }

                const response = await aiProvider.generateResponse(
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
                                    await msgSkill.react(remoteJid, msg.key, action.params.emoji);
                                    break;
                                case 'sendText':
                                    const target = action.params.jid || remoteJid;
                                    const sentActionMsg = await msgSkill.sendText(target, action.params.text);
                                    if (sentActionMsg && target === remoteJid) {
                                        rawHistory.push(sentActionMsg);
                                        await historyManager.saveHistory(remoteJid, rawHistory);
                                    }
                                    break;
                                case 'createGroup':
                                    const groupSkill = new GroupSkill(sock);
                                    await groupSkill.createGroup(action.params.name, action.params.participants);
                                    break;
                                case 'readFile':
                                    const fileReadSkill = new FileSkill(sock);
                                    await fileReadSkill.readFile(remoteJid, action.params.path, msg.key);
                                    break;
                                case 'editFile':
                                    const fileEditSkill = new FileSkill(sock);
                                    await fileEditSkill.editFile(remoteJid, action.params.path, action.params.content, msg.key);
                                    break;
                                case 'executeCommand':
                                    const commandSkill = new CommandSkill(sock);
                                    await commandSkill.executeCommand(remoteJid, action.params.command, msg.key);
                                    break;
                                case 'storeMemory':
                                    cognition.hippocampus.commitToLongTermMemory(remoteJid, action.params.fact, action.params.context);
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
                    const sentCleanMsg = await msgSkill.sendText(remoteJid, cleanResponse, msg);
                    if (sentCleanMsg) {
                        rawHistory.push(sentCleanMsg);
                        await historyManager.saveHistory(remoteJid, rawHistory);
                    }
                }
            } catch (error: any) {
                const status = error?.status || error?.statusCode || error?.response?.status;
                const errMsg = error?.message || '';
                if (status === 429 || errMsg.toLowerCase().includes('rate limit') || errMsg.toLowerCase().includes('quota')) {
                    console.error(`⚠️  RATE LIMITED by ${process.env.AI_PROVIDER || 'gemini'}. Slow down or upgrade your plan.`);
                    await msgSkill.sendText(remoteJid, '⏳ I\'m being rate limited right now. Try again in a moment.', msg);
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
