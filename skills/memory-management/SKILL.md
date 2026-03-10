---
name: Memory Management
description: Store durable user facts for future conversations.
---

# Memory Management Skill

This skill lets you save useful long-term facts about users.

## Capability

- **Store Memory**: Use `storeMemory` to persist important facts you can use later.

## Usage

- Store memory:
`{ "action": "storeMemory", "params": { "fact": "User's favorite car is a Porsche 911", "context": "chat about cars" } }`

## Guidance

- Save facts that are stable and useful (preferences, names, routines, key events).
- Avoid storing trivial one-off details that won't matter later.
