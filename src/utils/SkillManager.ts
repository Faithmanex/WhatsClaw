import fs from 'fs';
import path from 'path';

export class SkillManager {
    private skillsDir: string = 'skills';

    constructor() {
        if (!fs.existsSync(this.skillsDir)) {
            fs.mkdirSync(this.skillsDir, { recursive: true });
        }
    }

    async getAllSkills(): Promise<string> {
        let combinedSkills = "# ACTIVE SKILLS & GUIDELINES\n\n";
        
        try {
            const skillFolders = fs.readdirSync(this.skillsDir);
            
            for (const folder of skillFolders) {
                const skillPath = path.join(this.skillsDir, folder, 'SKILL.md');
                if (fs.existsSync(skillPath)) {
                    const content = fs.readFileSync(skillPath, 'utf-8');
                    combinedSkills += `${content}\n\n`;
                }
            }
        } catch (error) {
            console.error('Error loading skills:', error);
        }

        return combinedSkills;
    }
}
