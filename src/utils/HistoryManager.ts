import fs from 'fs';
import path from 'path';
import { proto } from '@whiskeysockets/baileys';

export class HistoryManager {
    private baseDir: string = 'histories';

    constructor() {
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir);
        }
    }

    async saveHistory(userId: string, messages: any[]) {
        const userDir = path.join(this.baseDir, userId.replace('@s.whatsapp.net', ''));
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
        }

        const filePath = path.join(userDir, 'messages.json');
        fs.writeFileSync(filePath, JSON.stringify(messages, null, 2));
    }

    async getHistory(userId: string): Promise<any[]> {
        const filePath = path.join(this.baseDir, userId.replace('@s.whatsapp.net', ''), 'messages.json');
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(data);
        }
        return [];
    }

    async fetchAndSave(sock: any, remoteJid: string, limit: number = 30) {
        // Fetch from WA
        const messages = await sock.fetchMessagesFromWA(remoteJid, limit);
        await this.saveHistory(remoteJid, messages);
        return messages;
    }
}
