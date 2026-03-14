import fs from 'fs';
import path from 'path';

export interface MemoryRecord {
    id: string;
    timestamp: number;
    updatedAt: number;
    fact: string;
    context: string;
    tags: string[];
    importance: number;
    accessCount: number;
    lastAccessedAt: number;
}

/**
 * Hippocampus: Long-term memory center.
 *
 * OpenClaw-style behavior integrated here:
 * - Persist memory facts per user.
 * - Update existing facts instead of duplicating near-identical facts.
 * - Retrieve top relevant memories using query overlap + recency + importance.
 */
export class Hippocampus {
    private memoriesDir: string = 'hippocampus_memories';
    private maxMemoriesPerUser = 150;

    constructor() {
        if (!fs.existsSync(this.memoriesDir)) {
            fs.mkdirSync(this.memoriesDir, { recursive: true });
        }
    }

    private getMemoryFilePath(jid: string): string {
        return path.join(this.memoriesDir, `${jid.replace(/[^a-zA-Z0-9]/g, '_')}.json`);
    }

    private normalizeText(value: string): string {
        return value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    private tokenize(value: string): string[] {
        const stopwords = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'your', 'from', 'have', 'just', 'about', 'are', 'was', 'were', 'you']);
        return this.normalizeText(value)
            .split(' ')
            .filter(Boolean)
            .filter(token => token.length > 2 && !stopwords.has(token));
    }

    private calculateOverlapScore(left: string, right: string): number {
        const leftTokens = new Set(this.tokenize(left));
        const rightTokens = new Set(this.tokenize(right));
        if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
        let overlap = 0;
        for (const token of leftTokens) {
            if (rightTokens.has(token)) overlap++;
        }
        return overlap / Math.max(leftTokens.size, rightTokens.size);
    }

    private loadMemories(jid: string): MemoryRecord[] {
        const filePath = this.getMemoryFilePath(jid);
        if (!fs.existsSync(filePath)) return [];

        try {
            const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Array<Partial<MemoryRecord>>;
            return parsed.map((record) => {
                const now = Date.now();
                return {
                    id: record.id || Math.random().toString(36).slice(2, 11),
                    timestamp: record.timestamp || now,
                    updatedAt: record.updatedAt || record.timestamp || now,
                    fact: record.fact || '',
                    context: record.context || 'general',
                    tags: Array.isArray(record.tags) ? record.tags.map(tag => String(tag)) : [],
                    importance: typeof record.importance === 'number' ? Math.min(1, Math.max(0, record.importance)) : 0.5,
                    accessCount: typeof record.accessCount === 'number' ? record.accessCount : 0,
                    lastAccessedAt: record.lastAccessedAt || record.timestamp || now,
                };
            }).filter(record => record.fact.trim().length > 0);
        } catch (error) {
            console.error(`Failed to load memories for ${jid}`, error);
            return [];
        }
    }

    private saveMemories(jid: string, memories: MemoryRecord[]) {
        const filePath = this.getMemoryFilePath(jid);
        fs.writeFileSync(filePath, JSON.stringify(memories, null, 2), 'utf-8');
    }

    public commitToLongTermMemory(jid: string, fact: string, context: string = 'general', tags: string[] = [], importance = 0.6) {
        const trimmedFact = fact.trim();
        if (!trimmedFact) return;

        const memories = this.loadMemories(jid);
        const now = Date.now();

        const duplicate = memories.find(memory => this.calculateOverlapScore(memory.fact, trimmedFact) >= 0.75);

        if (duplicate) {
            duplicate.updatedAt = now;
            duplicate.context = context || duplicate.context;
            duplicate.importance = Math.max(duplicate.importance, Math.min(1, Math.max(0, importance)));
            duplicate.tags = Array.from(new Set([...duplicate.tags, ...tags.map(t => t.toLowerCase())]));
        } else {
            memories.push({
                id: Math.random().toString(36).substring(2, 11),
                timestamp: now,
                updatedAt: now,
                fact: trimmedFact,
                context: context || 'general',
                tags: Array.from(new Set(tags.map(tag => tag.toLowerCase()))),
                importance: Math.min(1, Math.max(0, importance)),
                accessCount: 0,
                lastAccessedAt: now,
            });
        }

        if (memories.length > this.maxMemoriesPerUser) {
            memories.sort((a, b) => (b.updatedAt + b.accessCount * 1000) - (a.updatedAt + a.accessCount * 1000));
            memories.splice(this.maxMemoriesPerUser);
        }

        this.saveMemories(jid, memories);
    }

    /**
     * Best-effort auto extraction of stable facts from user text.
     */
    public extractAndStoreFromMessage(jid: string, text: string) {
        const normalized = text.trim();
        if (!normalized) return;

        const patterns: Array<{ regex: RegExp; context: string; tag: string; importance: number }> = [
            { regex: /\bmy name is\s+([a-zA-Z][a-zA-Z\-']{1,30})/i, context: 'identity', tag: 'identity', importance: 0.95 },
            { regex: /\bi(?:\s+really)?\s+like\s+([^.!?]{2,60})/i, context: 'preference', tag: 'preference', importance: 0.75 },
            { regex: /\bmy favorite\s+([^.!?]{2,40})\s+is\s+([^.!?]{2,60})/i, context: 'favorite', tag: 'favorite', importance: 0.85 },
            { regex: /\bi\s+live\s+in\s+([^.!?]{2,60})/i, context: 'location', tag: 'location', importance: 0.7 },
            { regex: /\bi\s+work\s+as\s+(?:an?\s+)?([^.!?]{2,60})/i, context: 'occupation', tag: 'occupation', importance: 0.7 },
        ];

        for (const pattern of patterns) {
            const match = normalized.match(pattern.regex);
            if (!match) continue;

            const extracted = match.slice(1).join(' ').replace(/\s+/g, ' ').trim();
            if (!extracted) continue;

            this.commitToLongTermMemory(
                jid,
                `User ${pattern.context === 'identity' ? 'name is' : pattern.context === 'favorite' ? 'favorite is' : pattern.context === 'occupation' ? 'works as' : pattern.context === 'location' ? 'lives in' : 'likes'} ${extracted}`,
                `auto-extracted:${pattern.context}`,
                [pattern.tag, 'auto'],
                pattern.importance
            );
        }
    }

    /**
     * Retrieves relevant memories for a user to inject into the prompt.
     */
    public retrieveRelevantMemories(jid: string, query: string = '', limit = 8): string {
        const memories = this.loadMemories(jid);
        if (memories.length === 0) return '';

        const now = Date.now();
        const ranked = memories
            .map(memory => {
                const queryScore = query ? this.calculateOverlapScore(`${memory.fact} ${memory.context} ${memory.tags.join(' ')}`, query) : 0.2;
                const daysOld = Math.max(1, (now - memory.updatedAt) / (1000 * 60 * 60 * 24));
                const recencyScore = 1 / Math.log2(daysOld + 1.5);
                const usageScore = Math.min(1, memory.accessCount / 10);
                const score = (queryScore * 0.55) + (memory.importance * 0.25) + (recencyScore * 0.15) + (usageScore * 0.05);
                return { memory, score };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .filter(item => item.score > 0.2);

        if (ranked.length === 0) return '';

        // Update access metadata for retrieved memories.
        const selectedIds = new Set(ranked.map(item => item.memory.id));
        for (const memory of memories) {
            if (!selectedIds.has(memory.id)) continue;
            memory.accessCount += 1;
            memory.lastAccessedAt = now;
        }
        this.saveMemories(jid, memories);

        const formattedFacts = ranked.map(({ memory }) => `- ${memory.fact}`).join('\n');
        return `\n\n[HIPPOCAMPUS (LONG-TERM MEMORIES)]\nUse these remembered facts only when relevant:\n${formattedFacts}`;
    }
}
