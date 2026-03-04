import OpenAI from "openai";
import { AIProvider, Message } from "../types/ai";

export class OpenAIProvider implements AIProvider {
    private openai: OpenAI;
    private model: string;

    constructor(apiKey: string, modelId: string) {
        this.openai = new OpenAI({ apiKey });
        this.model = modelId;
    }

    async generateResponse(history: Message[], prompt: string): Promise<string> {
        const response = await this.openai.chat.completions.create({
            model: this.model,
            messages: [...history, { role: 'user', content: prompt }] as any,
        });

        return response.choices[0].message.content || "";
    }
}
