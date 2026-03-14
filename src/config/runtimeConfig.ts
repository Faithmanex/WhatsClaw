import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

const RUNTIME_CONFIG_PATH = path.resolve('runtime-config.json');
const ENV_PATH = path.resolve('.env');

const DEFAULT_CONFIG: Record<string, string> = {
    AI_PROVIDER: 'gemini',
    AI_MODEL: '',
    GEMINI_API_KEY: '',
    OPENAI_API_KEY: '',
    ANTHROPIC_API_KEY: '',
    PERSONA_NAME: 'Antigravity',
    HISTORY_LIMIT: '30',
    WHATSAPP_DM_POLICY: 'open',
    WHATSAPP_ALLOW_FROM: '',
    WHATSAPP_GROUP_POLICY: 'disabled',
    WHATSAPP_READ_RECEIPTS: 'true',
    WHATSAPP_MENTION_TRIGGER: '',
};

function loadEnvValues(): Record<string, string> {
    if (!fs.existsSync(ENV_PATH)) return {};
    const raw = fs.readFileSync(ENV_PATH, 'utf-8');
    return dotenv.parse(raw);
}

function loadRuntimeFileValues(): Record<string, string> {
    if (!fs.existsSync(RUNTIME_CONFIG_PATH)) return {};
    try {
        const parsed = JSON.parse(fs.readFileSync(RUNTIME_CONFIG_PATH, 'utf-8')) as Record<string, unknown>;
        return Object.fromEntries(
            Object.entries(parsed)
                .filter(([, value]) => value !== null && value !== undefined)
                .map(([key, value]) => [key, String(value)])
        );
    } catch {
        return {};
    }
}

class RuntimeConfigStore {
    private config: Record<string, string>;

    constructor() {
        this.config = {
            ...DEFAULT_CONFIG,
            ...loadEnvValues(),
            ...loadRuntimeFileValues(),
        };
    }

    get(key: string, fallback = ''): string {
        return this.config[key] ?? fallback;
    }

    getAll(): Record<string, string> {
        return { ...this.config };
    }

    update(partial: Record<string, unknown>): Record<string, string> {
        const normalized = Object.fromEntries(
            Object.entries(partial)
                .filter(([, value]) => value !== undefined)
                .map(([key, value]) => [key, String(value)])
        );

        this.config = { ...this.config, ...normalized };
        fs.writeFileSync(RUNTIME_CONFIG_PATH, `${JSON.stringify(this.config, null, 2)}\n`, 'utf-8');
        return this.getAll();
    }
}

export const runtimeConfig = new RuntimeConfigStore();
