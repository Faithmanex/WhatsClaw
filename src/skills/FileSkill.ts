import * as fs from 'fs';
import * as path from 'path';
import { WASocket, proto } from '@whiskeysockets/baileys';

export class FileSkill {
    constructor(private sock: WASocket) {}

    async readFile(remoteJid: string, targetPath: string, messageKey: proto.IMessageKey) {
        try {
            const absolutePath = path.resolve(targetPath);
            if (!fs.existsSync(absolutePath)) {
                await this.sock.sendMessage(remoteJid, { text: `⚠️ Output from read file: File not found: ${targetPath}` }, { quoted: { key: messageKey, message: { conversation: '' } } as any });
                return;
            }

            const content = fs.readFileSync(absolutePath, 'utf8');
            // WhatsApp has a ~65k character limit. truncate if necessary.
            const truncated = content.length > 50000 ? content.substring(0, 50000) + '\n...[TRUNCATED]' : content;
            await this.sock.sendMessage(remoteJid, { text: `📄 [FILE CONTENT]: ${targetPath}\n\`\`\`\n${truncated}\n\`\`\`` }, { quoted: { key: messageKey, message: { conversation: '' } } as any });
        } catch (error: any) {
            await this.sock.sendMessage(remoteJid, { text: `❌ Failed to read file: ${error.message}` }, { quoted: { key: messageKey, message: { conversation: '' } } as any });
        }
    }

    async editFile(remoteJid: string, targetPath: string, content: string, messageKey: proto.IMessageKey) {
        try {
            const absolutePath = path.resolve(targetPath);
            const dir = path.dirname(absolutePath);
            
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(absolutePath, content, 'utf8');
            await this.sock.sendMessage(remoteJid, { text: `✅ Successfully updated file: ${targetPath}` }, { quoted: { key: messageKey, message: { conversation: '' } } as any });
        } catch (error: any) {
            await this.sock.sendMessage(remoteJid, { text: `❌ Failed to edit file: ${error.message}` }, { quoted: { key: messageKey, message: { conversation: '' } } as any });
        }
    }
}
