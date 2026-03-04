---
name: Contact Management
description: Save phone numbers to your personal contacts list.
---

# Contact Management Skill

This skill allows you to save phone numbers to an internal contacts list. When a person is saved to your contacts, you will see their name instead of their raw phone number in the chat history.

## Capabilities

- **Save Contact**: Use the `saveContact` tool to permanently associate a phone number with a name.

## Usage

Use the following JSON action to save a contact:

- Save Contact: `{ "action": "saveContact", "params": { "jid": "+1234567890", "name": "John Doe" } }`

**IMPORTANT**:

- Always try to ask for a person's name if you don't know it, then `saveContact` so you remember it forever!
- You can pass the raw phone number (like `+1234567890`) or their JID (like `1234567890@s.whatsapp.net`). The system will sanitize it.
