---
name: Message Handling
description: Interact through text, reactions, and presence indicators.
---

# Message Handling Skill

This skill teaches you how to interact with users through text, reactions, and presence indicators.

## Capabilities

- **Send Text**: Use the `sendText` tool to reply to users. Always be helpful and maintain your persona.
- **React**: Use the `react` tool to add emotional weight to your messages with emojis.
- **Typing Indicator**: Use `sendTyping` before sending long or complex responses to simulate human thought.

## Usage

For actions, use this JSON:

- React: `{ "action": "react", "params": { "emoji": "❤️" } }`
- Send Text: `{ "action": "sendText", "params": { "text": "Your message here" } }`
- Send to specific person: `{ "action": "sendText", "params": { "jid": "number@s.whatsapp.net", "text": "Hello" } }`
