import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, Message } from "../types/ai";

export class AnthropicProvider implements AIProvider {
    private anthropic: Anthropic;
    private model: string;

    constructor(apiKey: string, modelId: string) {
        this.anthropic = new Anthropic({ apiKey });
        this.model = modelId;
    }

    async generateResponse(history: Message[], prompt: string): Promise<string> {
        const response = await this.anthropic.messages.create({
            model: this.model,
            max_tokens: 1024,
            messages: history.map(m => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content
            })) as any,
        });

        const content = response.content[0];
        return content.type === 'text' ? content.text : "";
    }
}
