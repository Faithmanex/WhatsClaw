import { WASocket, proto } from '@whiskeysockets/baileys';
import { sanitizeJid } from '../utils/JidUtils';

export class MessageSkill {
    constructor(private sock: WASocket) {}

    async sendText(remoteJid: string, text: string, quoted?: any) {
        const cleanJid = sanitizeJid(remoteJid);
        return await this.sock.sendMessage(cleanJid, { text }, { quoted });
    }

    async react(remoteJid: string, messageKey: proto.IMessageKey, emoji: string) {
        await this.sock.sendMessage(remoteJid, { react: { text: emoji, key: messageKey } });
    }

    async sendTyping(remoteJid: string, duration: number = 2000) {
        await this.sock.presenceSubscribe(remoteJid);
        await this.sock.sendPresenceUpdate('composing', remoteJid);
        await new Promise(r => setTimeout(r, duration));
        await this.sock.sendPresenceUpdate('paused', remoteJid);
    }
}
