---
name: Terminal Command Execution
description: Run shell/CMD commands directly on the host system.
---

# Terminal Command Execution Skill

This skill allows you to run actual terminal commands directly on the user's host machine (which is a Windows PC). This gives you absolute power to interact with the OS, install dependencies, run scripts, manage builds, and execute tools autonomously.

## Capabilities

- **Execute Command**: Use the `executeCommand` tool to run a command. The command will run on the host system and the raw `stdout` and `stderr` will be sent back to you in a follow-up WhatsApp message.

## Usage

Use the following JSON structure to run a command:

- Execute Command: `{ "action": "executeCommand", "params": { "command": "npm run build" } }`
- Execute Command: `{ "action": "executeCommand", "params": { "command": "dir" } }`

## Constraints & Context

1. The OS is **Windows**. You should prefer `cmd.exe` or `powershell` compatibile commands (e.g., use `dir` instead of `ls` if unsure, use `cd` and `npm`, etc).
2. The server will run the command and WAIT for it to finish. Do not run commands that block forever (like `npm start` or starting a web server) via this action unless you intend to freeze the worker thread. For starting servers, you should configure them to run in the background if possible, or assume they are running.
3. The output will be sent back to you as a message originating from "System", so you can read the output, process it, and figure out your next autonomous step.
