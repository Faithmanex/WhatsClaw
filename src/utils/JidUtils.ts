export function sanitizeJid(jid: string): string {
    if (!jid) return jid;
    
    let localPart = jid;
    let domain = 's.whatsapp.net';

    if (jid.includes('@')) {
        const parts = jid.split('@');
        localPart = parts[0];
        domain = parts[1] || 's.whatsapp.net';
    }

    // Only strip non-numeric characters from the local part
    // Keep 'status' for status@broadcast
    if (localPart.toLowerCase() !== 'status') {
        localPart = localPart.replace(/[^0-9]/g, '');
    }

    // If completely empty after strip, fallback to original to prevent crashing
    if (!localPart) return jid;

    return `${localPart}@${domain}`;
}
