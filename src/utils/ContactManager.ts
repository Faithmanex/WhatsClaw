import fs from 'fs';
import path from 'path';
import { sanitizeJid } from './JidUtils';

export class ContactManager {
    private contactsPath = 'contacts.json';
    private contacts: Record<string, string> = {};

    constructor() {
        this.loadContacts();
    }

    private loadContacts() {
        if (fs.existsSync(this.contactsPath)) {
            try {
                this.contacts = JSON.parse(fs.readFileSync(this.contactsPath, 'utf8'));
            } catch (e) {
                this.contacts = {};
            }
        }
    }

    private saveContacts() {
        fs.writeFileSync(this.contactsPath, JSON.stringify(this.contacts, null, 2), 'utf8');
    }

    public saveContact(jid: string, name: string) {
        const cleanJid = sanitizeJid(jid);
        this.contacts[cleanJid] = name;
        this.saveContacts();
    }

    public getContactName(jid: string): string | null {
        const cleanJid = sanitizeJid(jid);
        return this.contacts[cleanJid] || null;
    }

    public getAllContacts(): Record<string, string> {
        return { ...this.contacts };
    }
}
