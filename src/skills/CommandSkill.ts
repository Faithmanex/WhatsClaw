import { exec } from 'child_process';
import { WASocket, proto } from '@whiskeysockets/baileys';

export class CommandSkill {
    constructor(private sock: WASocket) {}

    async executeCommand(remoteJid: string, command: string, messageKey: proto.IMessageKey) {
        try {
            await this.sock.sendMessage(remoteJid, { text: `⚡ \`Executing...\`\n> ${command}` }, { quoted: { key: messageKey, message: { conversation: '' } } as any });
            
            exec(command, async (error, stdout, stderr) => {
                let report = `🖥️ *Command Execution Result*\n\n*Command:*: \`${command}\`\n\n`;
                
                if (stdout) {
                    const truncOut = stdout.length > 50000 ? stdout.substring(0, 50000) + '\n...[TRUNCATED]' : stdout;
                    report += `*STDOUT:*\n\`\`\`\n${truncOut}\n\`\`\`\n`;
                }

                if (stderr) {
                    const truncErr = stderr.length > 50000 ? stderr.substring(0, 50000) + '\n...[TRUNCATED]' : stderr;
                    report += `*STDERR:*\n\`\`\`\n${truncErr}\n\`\`\`\n`;
                }

                if (error) {
                    report += `\n*ERROR:*\n\`\`\`\n${error.message}\n\`\`\``;
                }

                if (!stdout && !stderr && !error) {
                    report += `*Result:* Command completed with no output.`;
                }

                await this.sock.sendMessage(remoteJid, { text: report });
            });
        } catch (error: any) {
            await this.sock.sendMessage(remoteJid, { text: `❌ Failed to execute command: ${error.message}` });
        }
    }
}