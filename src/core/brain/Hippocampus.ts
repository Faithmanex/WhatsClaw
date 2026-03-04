import fs from 'fs';
import path from 'path';

export interface MemoryRecord {
    id: string;
    timestamp: number;
    fact: string;
    context: string;
}

/**
 * Hippocampus: The Memory Center.
 * Responsible for extracting, storing, and retrieving long-term factual memories about users.
 */
export class Hippocampus {
    private memoriesDir: string = 'hippocampus_memories';

    constructor() {
        if (!fs.existsSync(this.memoriesDir)) {
            fs.mkdirSync(this.memoriesDir, { recursive: true });
        }
    }

    private getMemoryFilePath(jid: string): string {
        return path.join(this.memoriesDir, `${jid.replace(/[^0-9]/g, '')}.json`);
    }

    private loadMemories(jid: string): MemoryRecord[] {
        const filePath = this.getMemoryFilePath(jid);
        if (fs.existsSync(filePath)) {
            try {
                return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            } catch (e) {
                console.error(`Failed to load memories for ${jid}`, e);
                return [];
            }
        }
        return [];
    }

    private saveMemories(jid: string, memories: MemoryRecord[]) {
        const filePath = this.getMemoryFilePath(jid);
        fs.writeFileSync(filePath, JSON.stringify(memories, null, 2), 'utf-8');
    }

    /**
     * Extracts facts from a recent interaction and stores them.
     * Note: In a production system, you would use an LLM call here to extract structured facts.
     * For now, we will expose an explicit "storeFact" action to the AI, allowing the AI's
     * cerebral cortex to decide when to commit something to long-term memory.
     */
    public commitToLongTermMemory(jid: string, fact: string, context: string) {
        const memories = this.loadMemories(jid);
        memories.push({
            id: Math.random().toString(36).substring(2, 11),
            timestamp: Date.now(),
            fact,
            context
        });
        
        // Keep the most recent 100 memories to avoid blowing up the context window
        if (memories.length > 100) {
            memories.shift();
        }
        
        this.saveMemories(jid, memories);
    }

    /**
     * Retrieves relevant memories for a user to inject into the system prompt.
     */
    public retrieveRelevantMemories(jid: string): string {
        const memories = this.loadMemories(jid);
        if (memories.length === 0) return "";

        const formattedFacts = memories.map(m => `- ${m.fact}`).join('\n');
        return `\n\n[HIPPOCAMPUS (LONG-TERM MEMORIES)]\nYou have learned the following facts about this user:\n${formattedFacts}`;
    }
}
