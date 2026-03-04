---
name: File Management
description: Read and edit internal files.
---

# File Management Skill

This skill allows you to read your own internal code and configuration files, and edit them to update your behavior or data.

## Capabilities

- **Read File**: Use the `readFile` tool to read the contents of a file. The system will respond with the file content in the next message.
- **Edit File**: Use the `editFile` tool to completely overwrite a file with new content. Use carefully!

## Usage

Use the following JSON actions to interact with files:

- Read File: `{ "action": "readFile", "params": { "path": "src/core/CognitionEngine.ts" } }`
- Edit File: `{ "action": "editFile", "params": { "path": "skills/custom-skill/SKILL.md", "content": "..." } }`

**IMPORTANT**:

1. The path is relative to the root directory of your project.
2. For editing, `content` must contain the absolute entirety of the new file. It will completely overwrite the existing file.
