import fs from 'fs';
import path from 'path';
import {
    BUILTIN_PROVIDERS,
    ModelDefinition,
    ProviderDefinition,
    ProviderProtocol,
    customApiKeyEnvVar,
} from './providers';

const PROVIDERS_PATH = path.resolve('providers.json');
const PROVIDER_ID_RE = /^[a-z0-9][a-z0-9-_]{0,31}$/;
const PROTOCOLS: ProviderProtocol[] = ['openai', 'anthropic', 'gemini'];

function sanitizeModels(rawModels: unknown): ModelDefinition[] {
    if (!Array.isArray(rawModels) || rawModels.length === 0) {
        throw new Error('At least one model is required');
    }
    if (rawModels.length > 64) {
        throw new Error('A provider can define at most 64 models');
    }

    const models: ModelDefinition[] = rawModels.map((raw) => {
        const r = (raw || {}) as Record<string, unknown>;
        const id = String(r.id || '').trim();
        if (!id) throw new Error('Every model needs an id');
        const ctx = Number(r.contextWindow);
        return {
            id,
            name: String(r.name || id).trim(),
            contextWindow: Number.isFinite(ctx) && ctx > 0 ? ctx : 128000,
            default: r.default === true,
        };
    });

    const duplicates = models.filter((m, i) => models.findIndex((o) => o.id === m.id) !== i);
    if (duplicates.length) throw new Error(`Duplicate model ids: ${duplicates.map((m) => m.id).join(', ')}`);

    if (models.filter((m) => m.default).length > 1) {
        throw new Error('Only one model can be marked as default');
    }
    if (!models.some((m) => m.default)) {
        models[0].default = true;
    }
    return models;
}

function sanitizeProvider(input: Record<string, unknown>, id: string): ProviderDefinition {
    const name = String(input.name || '').trim();
    if (!name) throw new Error('Provider name is required');
    if (name.length > 80) throw new Error('Provider name is too long');

    const protocol = String(input.protocol || 'openai') as ProviderProtocol;
    if (!PROTOCOLS.includes(protocol)) {
        throw new Error(`Protocol must be one of: ${PROTOCOLS.join(', ')}`);
    }

    const baseUrl = String(input.baseUrl || '').trim() || undefined;
    if (baseUrl && !/^https?:\/\/[^\s]+$/i.test(baseUrl)) {
        throw new Error('Base URL must be a valid http(s) URL');
    }

    const keyPlaceholder = String(input.keyPlaceholder || 'API key').trim().slice(0, 80);

    return {
        id,
        name,
        protocol,
        baseUrl,
        keyPlaceholder,
        apiKeyEnvVar: customApiKeyEnvVar(id),
        builtin: false,
        models: sanitizeModels(input.models),
    };
}

class ProviderRegistry {
    private custom: ProviderDefinition[] = [];

    constructor() {
        this.loadCustom();
    }

    private loadCustom(): void {
        if (!fs.existsSync(PROVIDERS_PATH)) return;
        try {
            const parsed = JSON.parse(fs.readFileSync(PROVIDERS_PATH, 'utf-8'));
            if (!Array.isArray(parsed)) return;
            this.custom = parsed
                .filter((p) => p && typeof p === 'object')
                .map((p) => {
                    const raw = p as Record<string, unknown>;
                    const id = String(raw.id || '').trim();
                    if (!PROVIDER_ID_RE.test(id)) return null;
                    try {
                        return sanitizeProvider(raw, id);
                    } catch {
                        return null;
                    }
                })
                .filter((p): p is ProviderDefinition => p !== null);
        } catch {
            this.custom = [];
        }
    }

    private persist(): void {
        fs.writeFileSync(PROVIDERS_PATH, `${JSON.stringify(this.custom, null, 2)}\n`, 'utf-8');
    }

    getAll(): ProviderDefinition[] {
        return [...BUILTIN_PROVIDERS, ...this.custom];
    }

    getProvider(id: string): ProviderDefinition | undefined {
        return this.getAll().find((p) => p.id === id);
    }

    getModelsForProvider(id: string): ModelDefinition[] {
        return this.getProvider(id)?.models || [];
    }

    resolveModel(id: string, modelId?: string): string {
        const provider = this.getProvider(id);
        if (!provider) throw new Error(`Unknown provider: ${id}`);
        if (modelId) {
            const found = provider.models.find((m) => m.id === modelId);
            return found ? found.id : modelId;
        }
        const fallback = provider.models.find((m) => m.default) || provider.models[0];
        return fallback?.id || '';
    }

    isCustom(id: string): boolean {
        return this.custom.some((p) => p.id === id);
    }

    addCustomProvider(input: Record<string, unknown>): ProviderDefinition {
        const id = String(input.id || '').trim().toLowerCase();
        if (!PROVIDER_ID_RE.test(id)) {
            throw new Error('Provider id must be 1-32 chars: lowercase letters, digits, dash or underscore');
        }
        if (this.getProvider(id)) {
            throw new Error(`A provider with id "${id}" already exists`);
        }
        const provider = sanitizeProvider(input, id);
        this.custom.push(provider);
        this.persist();
        return provider;
    }

    updateCustomProvider(id: string, input: Record<string, unknown>): ProviderDefinition {
        const index = this.custom.findIndex((p) => p.id === id);
        if (index === -1) throw new Error(`No custom provider with id "${id}"`);
        const merged: Record<string, unknown> = {
            name: input.name !== undefined ? input.name : this.custom[index].name,
            protocol: input.protocol !== undefined ? input.protocol : this.custom[index].protocol,
            baseUrl: input.baseUrl !== undefined ? input.baseUrl : this.custom[index].baseUrl,
            keyPlaceholder: input.keyPlaceholder !== undefined ? input.keyPlaceholder : this.custom[index].keyPlaceholder,
            models: input.models !== undefined ? input.models : this.custom[index].models,
        };
        const updated = sanitizeProvider(merged, id);
        this.custom[index] = updated;
        this.persist();
        return updated;
    }

    removeCustomProvider(id: string): void {
        const index = this.custom.findIndex((p) => p.id === id);
        if (index === -1) throw new Error(`No custom provider with id "${id}"`);
        this.custom.splice(index, 1);
        this.persist();
    }
}

export const providerRegistry = new ProviderRegistry();
