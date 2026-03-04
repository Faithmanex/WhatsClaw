import { WASocket } from '@whiskeysockets/baileys';
import { sanitizeJid } from '../utils/JidUtils';

export class GroupSkill {
    constructor(private sock: WASocket) {}

    private sanitizeJids(jids: string[]): string[] {
        return jids.map(jid => sanitizeJid(jid));
    }

    async promote(groupId: string, participantIds: string[]) {
        await this.sock.groupParticipantsUpdate(groupId, this.sanitizeJids(participantIds), 'promote');
    }

    async demote(groupId: string, participantIds: string[]) {
        await this.sock.groupParticipantsUpdate(groupId, this.sanitizeJids(participantIds), 'demote');
    }

    async add(groupId: string, participantIds: string[]) {
        await this.sock.groupParticipantsUpdate(groupId, this.sanitizeJids(participantIds), 'add');
    }

    async remove(groupId: string, participantIds: string[]) {
        await this.sock.groupParticipantsUpdate(groupId, this.sanitizeJids(participantIds), 'remove');
    }

    async inviteLink(groupId: string) {
        return await this.sock.groupInviteCode(groupId);
    }

    async createGroup(name: string, participantIds: string[]) {
        return await this.sock.groupCreate(name, this.sanitizeJids(participantIds));
    }
}
