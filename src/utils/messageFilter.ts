/**
 * Non-chat jids that must never trigger AI replies or be stored as chats:
 * statuses (status@broadcast / status_contact@broadcast), newsletters.
 */
export function isNonChatJid(jid: string): boolean {
    const lower = (jid || '').toLowerCase();
    if (lower === 'status@broadcast') return true;
    if (lower === 'status_contact' || lower === 'status_contact@broadcast') return true;
    if (lower.endsWith('@newsletter')) return true;
    if (lower.endsWith('@broadcast')) return true;
    return false;
}

/** Extracts the readable text of a message (empty string for media/protocol). */
export function getMessageText(msg: any): string {
    const m = msg?.message;
    if (!m) return '';
    return m.conversation || m.extendedTextMessage?.text || m.textMessage?.text || '';
}

/**
 * Junk messages that must not reach the AI or pollute history:
 * protocol messages (read receipts, revokes, edits, history syncs),
 * key distribution messages, and anything without readable text.
 */
export function isJunkMessage(msg: any): boolean {
    const m = msg?.message;
    if (!m) return true;
    if (m.protocolMessage) return true;
    if (m.senderKeyDistributionMessage) return true;
    return getMessageText(msg) === '';
}