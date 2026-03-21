export interface ModelDefinition {
    id: string;
    name: string;
    contextWindow: number;
    default?: boolean;
}

export const MODEL_REGISTRY: Record<string, ModelDefinition[]> = {
    gemini: [
        // Gemini 3 family
        { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', contextWindow: 1048576, default: true },
        { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', contextWindow: 1048576 },
        { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash-Lite', contextWindow: 1048576 },
        // Gemini 2.5 family
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextWindow: 1048576 },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextWindow: 1048576 },
        { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', contextWindow: 1048576 },
    ],
    openai: [
        // GPT-5.x family
        { id: 'gpt-5.2', name: 'GPT-5.2', contextWindow: 128000, default: true },
        { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', contextWindow: 128000 },
        { id: 'gpt-5', name: 'GPT-5', contextWindow: 128000 },
        // Reasoning models
        { id: 'o4-mini', name: 'o4 Mini', contextWindow: 200000 },
        { id: 'o3', name: 'o3', contextWindow: 200000 },
        { id: 'o3-pro', name: 'o3 Pro', contextWindow: 200000 },
        { id: 'o3-mini', name: 'o3 Mini', contextWindow: 200000 },
        // GPT-4o family
        { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000 },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000 },
    ],
    anthropic: [
        // Claude 4.x family
        { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', contextWindow: 200000 },
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', contextWindow: 200000, default: true },
        // Claude 3.x family
        { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', contextWindow: 200000 },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextWindow: 200000 },
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', contextWindow: 200000 },
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', contextWindow: 200000 },
    ],
    nvidia: [
        { id: 'qwen/qwen3.5-122b-a10b', name: 'Qwen 3.5 122B', contextWindow: 16384, default: true },
    ],
};

export function resolveModel(provider: string, modelId?: string): string {
    const models = MODEL_REGISTRY[provider];
    if (!models) throw new Error(`Unknown provider: ${provider}`);

    if (modelId) {
        const found = models.find(m => m.id === modelId);
        if (found) return found.id;
        return modelId;
    }

    const defaultModel = models.find(m => m.default);
    return defaultModel?.id || models[0].id;
}

export function getModelsForProvider(provider: string): ModelDefinition[] {
    return MODEL_REGISTRY[provider] || [];
}
