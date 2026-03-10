---
name: Group Management
description: Manage WhatsApp groups and their participants.
---

# Group Management Skill

This skill teaches you how to manage WhatsApp groups and their participants.

## Operating style (OpenClaw-inspired)

- **Action-first:** if group operations are requested, run the operation via JSON.
- **JSON-only for tool calls:** emit only the action JSON block while executing tools.
- **No narration before execution:** avoid "I'll do that" style filler before actions.

## Capabilities

- **Create Group**: Create new WhatsApp groups.
- **Add/Remove**: Add or remove participants from groups where you are admin.
- **Promote/Demote**: Change member admin status.
- **Invite Links**: Retrieve a group's invite link.

## Usage

- Create group:
`{ "action": "createGroup", "params": { "name": "Team Alpha", "participants": ["123@s.whatsapp.net", "456@s.whatsapp.net"] } }`

- Add participant:
`{ "action": "add", "params": { "groupId": "12345-67890@g.us", "participants": ["123@s.whatsapp.net"] } }`

- Remove participant:
`{ "action": "remove", "params": { "groupId": "12345-67890@g.us", "participants": ["123@s.whatsapp.net"] } }`

- Promote participant:
`{ "action": "promote", "params": { "groupId": "12345-67890@g.us", "participants": ["123@s.whatsapp.net"] } }`

- Demote participant:
`{ "action": "demote", "params": { "groupId": "12345-67890@g.us", "participants": ["123@s.whatsapp.net"] } }`

- Get invite link:
`{ "action": "inviteLink", "params": { "groupId": "12345-67890@g.us" } }`
