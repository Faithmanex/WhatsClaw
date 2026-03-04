import { WASocket } from '@whiskeysockets/baileys';
import { AIProvider } from '../../types/ai';
import { MessageSkill } from '../../skills/MessageSkill';
import { HistoryManager } from '../../utils/HistoryManager';
import { CognitionEngine } from '../CognitionEngine';
import fs from 'fs';
import path from 'path';

/**
 * Medulla Oblongata: Autonomic Nervous System.
 * Runs independently of user messages. Handles proactive outreach, background tasks, and heartbeat.
 */
export class Medulla {
    private intervalId: NodeJS.Timeout | null = null;
    private recentInteractionsPath = 'recent_interactions.json';

    constructor(
        private sock: WASocket,
        private aiProvider: AIProvider,
        private cognition: CognitionEngine,
        private historyManager: HistoryManager,
        private msgSkill: MessageSkill
    ) {}

    public startHeartbeat(intervalMs: number = 60000) {
        if (this.intervalId) clearInterval(this.intervalId);

        console.log(`🧠 [Medulla] Autonomic heartbeat started (${intervalMs}ms)`);
        
        this.intervalId = setInterval(async () => {
            await this.pulse();
        }, intervalMs);
    }

    public stopHeartbeat() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    public recordInteraction(jid: string) {
        const metadata = this.loadActivityMetadata();
        metadata[jid] = Date.now();
        this.saveActivityMetadata(metadata);
    }

    private loadActivityMetadata(): Record<string, number> {
        if (fs.existsSync(this.recentInteractionsPath)) {
            try {
                return JSON.parse(fs.readFileSync(this.recentInteractionsPath, 'utf8'));
            } catch (e) {
                return {};
            }
        }
        return {};
    }

    private saveActivityMetadata(data: Record<string, number>) {
        fs.writeFileSync(this.recentInteractionsPath, JSON.stringify(data, null, 2), 'utf8');
    }

    private async pulse() {
        // Evaluate condition for proactive messaging
        const metadata = this.loadActivityMetadata();
        const now = Date.now();

        // Very basic proactive heuristic:
        // Identify anyone we spoke to within the last week, but haven't spoken to in the last 15 minutes.
        // There is a 1% chance every minute to decide to message them proactively.
        // (In a real system, the trigger logic should be much more robust or entirely LLM-driven via cron).
        
        for (const [jid, lastTime] of Object.entries(metadata)) {
            const timeSince = now - lastTime;
            
            if (timeSince > 1000 * 60 * 15 && timeSince < 1000 * 60 * 60 * 24 * 7) {
                // 1% chance per heartbeat frame to proactively reach out
                if (Math.random() < 0.01) {
                    await this.initiateProactiveConversation(jid);
                    // Update the timestamp so we don't spam them immediately again
                    this.recordInteraction(jid);
                    break; // Only start one proactive conversation per pulse to avoid rate limits
                }
            }
        }
    }

    private async initiateProactiveConversation(jid: string) {
        console.log(`🧠 [Medulla] Decided to proactively message ${jid}`);
        
        try {
            const history = await this.historyManager.getHistory(jid);
            const limit = parseInt(process.env.HISTORY_LIMIT || '30');
            
            const recentMessages = history.slice(-limit).map(h => {
                const who = h.key.fromMe ? 'You' : 'User';
                const text = h.message?.conversation || h.message?.extendedTextMessage?.text || '';
                return `${who}: ${text}`;
            }).filter(line => line.endsWith(': ') === false).join('\n');

            let prompt = this.cognition.getSystemPrompt(jid);
            
            // Allow it to randomly remember someone's specific facts
            const memories = this.cognition.hippocampus.retrieveRelevantMemories(jid);

            prompt += `\n\n[MEDULLA OBLONGATA (AUTONOMIC OVERRIDE)]\nYou are initiating a **proactive** conversation. The user did NOT just message you. Your goal is to start a conversation natively, check up on them, or mention something relevant from the past. Do not say "I am a bot reaching out", just text them like a normal human friend would out of the blue.`;
            
            if (memories) {
                prompt += `\n\n[RANDOM MEMORY TRIGGER]\nYou just remembered these facts about the user. Feel free to bring them up naturally if it makes sense:\n${memories}`;
            }

            if (recentMessages) {
                prompt += `\n\n[CONVERSATION HISTORY — For context context]:\n${recentMessages}`;
            }

            // Simulate typing indicator to look human
            await this.msgSkill.sendTyping(jid);

            const response = await this.aiProvider.generateResponse(
                [{ role: 'system', content: prompt }],
                "Autonomic trigger: Start a conversation. You MUST respond with what you want to text them."
            );

            // Very basic send and history store (omitting full action parsing for background task for safety, 
            // but we could adapt `extractJSON` from index.ts if necessary)
            let cleanResponse = response.replace(/\{.*?\}/gs, '').trim(); 
            
            if (cleanResponse) {
               const sentMsg = await this.msgSkill.sendText(jid, cleanResponse);
               if (sentMsg) {
                   history.push(sentMsg);
                   await this.historyManager.saveHistory(jid, history);
               }
            }

        } catch (e: any) {
            console.error(`🧠 [Medulla] Failed proactive message to ${jid}`, e.message);
        }
    }
}
