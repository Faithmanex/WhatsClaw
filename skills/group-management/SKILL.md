---
name: Group Management
description: Manage WhatsApp groups and their participants.
---

# Group Management Skill

This skill teaches you how to manage WhatsApp groups and their participants.

## Capabilities

- **Add/Remove**: You can add or remove participants from groups you are an admin of.
- **Promote/Demote**: You can change the admin status of members.
- **Invite Links**: You can retrieve or reset group invite links.

## Usage

Create a group:
`{ "action": "createGroup", "params": { "name": "Team Alpha", "participants": ["123@s.whatsapp.net", "456@s.whatsapp.net"] } }`
