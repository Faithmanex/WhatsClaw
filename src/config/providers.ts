export type ProviderProtocol = 'openai' | 'anthropic' | 'gemini';

export interface ModelDefinition {
    id: string;
    name: string;
    contextWindow: number;
    default?: boolean;
}

export interface ProviderDefinition {
    id: string;
    name: string;
    protocol: ProviderProtocol;
    baseUrl?: string;
    apiKeyEnvVar: string;
    keyPlaceholder: string;
    description?: string;
    builtin: boolean;
    models: ModelDefinition[];
    extraBody?: Record<string, unknown>;
}

export const BUILTIN_PROVIDERS: ProviderDefinition[] = [
    {
        id: 'gemini',
        name: 'Gemini',
        protocol: 'gemini',
        apiKeyEnvVar: 'GEMINI_API_KEY',
        keyPlaceholder: 'AIza...',
        description: 'Google AI Studio / Vertex models',
        builtin: true,
        models: [
            { id: 'gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', contextWindow: 1048576, default: true },
            { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash', contextWindow: 1048576 },
            { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash-Lite', contextWindow: 1048576 },
            { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', contextWindow: 1048576 },
            { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', contextWindow: 1048576 },
            { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', contextWindow: 1048576 },
        ],
    },
    {
        id: 'openai',
        name: 'OpenAI',
        protocol: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        apiKeyEnvVar: 'OPENAI_API_KEY',
        keyPlaceholder: 'sk-...',
        description: 'OpenAI Chat Completions API',
        builtin: true,
        models: [
            { id: 'gpt-5.2', name: 'GPT-5.2', contextWindow: 128000, default: true },
            { id: 'gpt-5.2-codex', name: 'GPT-5.2 Codex', contextWindow: 128000 },
            { id: 'gpt-5', name: 'GPT-5', contextWindow: 128000 },
            { id: 'o4-mini', name: 'o4 Mini', contextWindow: 200000 },
            { id: 'o3', name: 'o3', contextWindow: 200000 },
            { id: 'o3-pro', name: 'o3 Pro', contextWindow: 200000 },
            { id: 'o3-mini', name: 'o3 Mini', contextWindow: 200000 },
            { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000 },
            { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000 },
        ],
    },
    {
        id: 'anthropic',
        name: 'Anthropic',
        protocol: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        apiKeyEnvVar: 'ANTHROPIC_API_KEY',
        keyPlaceholder: 'sk-ant-...',
        description: 'Anthropic Claude Messages API',
        builtin: true,
        models: [
            { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', contextWindow: 200000 },
            { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', contextWindow: 200000, default: true },
            { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', contextWindow: 200000 },
            { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', contextWindow: 200000 },
            { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', contextWindow: 200000 },
            { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', contextWindow: 200000 },
        ],
    },
    {
        id: 'nvidia',
        name: 'NVIDIA NIM',
        protocol: 'openai',
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        apiKeyEnvVar: 'NVIDIA_API_KEY',
        keyPlaceholder: 'nvapi-...',
        description: 'NVIDIA NIM hosted models (OpenAI-compatible)',
        builtin: true,
        extraBody: {
            chat_template_kwargs: { enable_thinking: true },
            temperature: 0.60,
            top_p: 0.95,
        },
        models: [
            { id: 'deepseek-ai/deepseek-v4-pro', name: 'DeepSeek v4 Pro', contextWindow: 128000 },
            { id: 'deepseek-ai/deepseek-v4-flash', name: 'DeepSeek v4 Flash', contextWindow: 128000 },
            { id: 'qwen/qwen3.5-122b-a10b', name: 'Qwen 3.5 122B', contextWindow: 32768, default: true },
            { id: 'meta/llama-3.1-70b-instruct', name: 'Llama 3.1 70B', contextWindow: 128000 },
            { id: 'meta/llama-3.1-405b-instruct', name: 'Llama 3.1 405B', contextWindow: 128000 },
        ],
    },
    {
        id: 'opencode',
        name: 'OpenCode Zen',
        protocol: 'openai',
        baseUrl: 'https://opencode.ai/zen/v1',
        apiKeyEnvVar: 'OPENCODE_API_KEY',
        keyPlaceholder: 'Zen key (opencode.ai/auth)',
        description: 'OpenCode Zen — curated frontier models, pay-as-you-go. Sign up at opencode.ai/auth',
        builtin: true,
        models: [
            { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash', contextWindow: 128000, default: true },
            { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', contextWindow: 128000 },
            { id: 'glm-5.2', name: 'GLM 5.2', contextWindow: 200000 },
            { id: 'glm-5.1', name: 'GLM 5.1', contextWindow: 200000 },
            { id: 'kimi-k3', name: 'Kimi K3', contextWindow: 256000 },
            { id: 'kimi-k2.7-code', name: 'Kimi K2.7 Code', contextWindow: 256000 },
            { id: 'kimi-k2.6', name: 'Kimi K2.6', contextWindow: 256000 },
            { id: 'kimi-k2.5', name: 'Kimi K2.5', contextWindow: 256000 },
            { id: 'minimax-m3', name: 'MiniMax M3', contextWindow: 200000 },
            { id: 'minimax-m2.7', name: 'MiniMax M2.7', contextWindow: 200000 },
            { id: 'big-pickle', name: 'Big Pickle (Free)', contextWindow: 200000 },
            { id: 'deepseek-v4-flash-free', name: 'DeepSeek V4 Flash (Free)', contextWindow: 128000 },
            { id: 'nemotron-3.5-lightning-free', name: 'Nemotron 3.5 Lightning (Free)', contextWindow: 128000 },
            { id: 'nemotron-3-ultra-free', name: 'Nemotron 3 Ultra (Free)', contextWindow: 128000 },
            { id: 'mimo-v2.5-free', name: 'MiMo-V2.5 (Free)', contextWindow: 128000 },
            { id: 'hy3-free', name: 'Hy3 (Free)', contextWindow: 128000 },
            { id: 'laguna-s-2.1-free', name: 'Laguna S 2.1 (Free)', contextWindow: 128000 },
        ],
    },
];

export function defaultModelFor(provider: ProviderDefinition): ModelDefinition | undefined {
    return provider.models.find((m) => m.default) || provider.models[0];
}

export function customApiKeyEnvVar(providerId: string): string {
    return `CUSTOM_${providerId.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_API_KEY`;
}
