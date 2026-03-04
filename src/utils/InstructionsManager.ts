import fs from 'fs';
import path from 'path';

export class InstructionsManager {
    private baseDir: string = 'instructions';

    constructor() {
        if (!fs.existsSync(this.baseDir)) {
            fs.mkdirSync(this.baseDir);
        }
    }

    async getInstruction(jid: string): Promise<string | null> {
        const filePath = path.join(this.baseDir, `${jid.replace(/[:@]/g, '_')}.txt`);
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf-8').trim();
        }
        return null;
    }

    async saveInstruction(jid: string, text: string) {
        const filePath = path.join(this.baseDir, `${jid.replace(/[:@]/g, '_')}.txt`);
        fs.writeFileSync(filePath, text);
    }
}
