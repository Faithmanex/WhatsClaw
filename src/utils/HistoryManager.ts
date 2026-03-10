import fs from 'fs';
import path from 'path';

export class HistoryManager {
    private baseDir: string = 'histories';

    constructor() {
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir, { recursive: true });
        }
    }

    private getChatKey(chatId: string): string {
        return chatId.replace(/[^a-zA-Z0-9._-]/g, '_');
    }

    private getHistoryFilePath(chatId: string): string {
        return path.join(this.baseDir, this.getChatKey(chatId), 'messages.json');
    }

    async saveHistory(chatId: string, messages: any[]) {
        const filePath = this.getHistoryFilePath(chatId);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(filePath, JSON.stringify(messages, null, 2));
    }

    async getHistory(chatId: string): Promise<any[]> {
        const filePath = this.getHistoryFilePath(chatId);
        if (!fs.existsSync(filePath)) return [];

        try {
            const data = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(data);
        } catch {
            return [];
        }
    }

    async appendIfMissing(chatId: string, message: any): Promise<any[]> {
        const history = await this.getHistory(chatId);
        const id = message?.key?.id;

        if (!id || !history.some(h => h?.key?.id === id)) {
            history.push(message);
            await this.saveHistory(chatId, history);
        }

        return history;
    }
}
