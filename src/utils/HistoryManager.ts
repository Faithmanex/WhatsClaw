import fs from 'fs';
import path from 'path';

export class HistoryManager {
    private baseDir: string = 'histories';
    private queues = new Map<string, Promise<unknown>>();

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

    /**
     * Serializes read-modify-write cycles per chat so concurrent flows
     * (message handler + Medulla + API routes) never clobber each other's writes.
     */
    private enqueue<T>(chatId: string, task: () => Promise<T>): Promise<T> {
        const key = this.getChatKey(chatId);
        const prev = this.queues.get(key) ?? Promise.resolve();
        const next = prev.catch(() => {}).then(task);
        this.queues.set(key, next);
        next.finally(() => {
            if (this.queues.get(key) === next) this.queues.delete(key);
        });
        return next;
    }

    private readHistory(chatId: string): any[] {
        const filePath = this.getHistoryFilePath(chatId);
        if (!fs.existsSync(filePath)) return [];

        try {
            const data = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(data);
        } catch {
            return [];
        }
    }

    private writeHistory(chatId: string, messages: any[]) {
        const filePath = this.getHistoryFilePath(chatId);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(messages, null, 2));
    }

    async saveHistory(chatId: string, messages: any[]) {
        return this.enqueue(chatId, async () => {
            this.writeHistory(chatId, messages);
        });
    }

    async getHistory(chatId: string): Promise<any[]> {
        return this.enqueue(chatId, () => Promise.resolve(this.readHistory(chatId)));
    }

    async appendIfMissing(chatId: string, message: any): Promise<any[]> {
        return this.enqueue(chatId, async () => {
            const history = await this.readHistory(chatId);
            const id = message?.key?.id;

            if (!id || !history.some(h => h?.key?.id === id)) {
                history.push(message);
                this.writeHistory(chatId, history);
            }

            return history;
        });
    }
}
