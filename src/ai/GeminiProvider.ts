import { GoogleGenerativeAI } from "@google/generative-ai";
import { AIProvider, Message } from "../types/ai";

export class GeminiProvider implements AIProvider {
    private genAI: GoogleGenerativeAI;
    private model: any;

    constructor(apiKey: string, modelId: string) {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: modelId });
    }

    async generateResponse(history: Message[], prompt: string): Promise<string> {
        const chat = this.model.startChat({
            history: history.map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }],
            })),
        });

        const result = await chat.sendMessage(prompt);
        return result.response.text();
    }
}
