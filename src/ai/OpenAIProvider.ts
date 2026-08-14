import OpenAI from "openai";
import { AIProvider, Message } from "../types/ai";

export interface OpenAIProviderOptions {
    apiKey: string;
    modelId: string;
    baseUrl?: string;
    timeoutMs?: number;
    extraBody?: Record<string, unknown>;
}

export class OpenAIProvider implements AIProvider {
    private openai: OpenAI;
    private model: string;
    private extraBody?: Record<string, unknown>;

    constructor({ apiKey, modelId, baseUrl, timeoutMs, extraBody }: OpenAIProviderOptions) {
        this.openai = new OpenAI({
            apiKey,
            baseURL: baseUrl,
            timeout: timeoutMs || undefined,
        });
        this.model = modelId;
        this.extraBody = extraBody;
    }

    async generateResponse(history: Message[], prompt: string): Promise<string> {
        const response = await this.openai.chat.completions.create({
            model: this.model,
            messages: [...history, { role: 'user', content: prompt }] as any,
            ...(this.extraBody || {}),
        });

        return response.choices[0].message.content || "";
    }
}
