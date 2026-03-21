import { AIProvider, Message } from "../types/ai";

export class NvidiaProvider implements AIProvider {
    private apiKey: string;
    private model: string;

    constructor(apiKey: string, modelId: string) {
        this.apiKey = apiKey;
        this.model = modelId;
    }

    async generateResponse(history: Message[], prompt: string): Promise<string> {
        const invokeUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
        
        const headers = {
            "Authorization": `Bearer ${this.apiKey}`,
            "Accept": "application/json",
            "Content-Type": "application/json"
        };

        const payload = {
            "model": this.model,
            "messages": [...history, { role: "user", content: prompt }],
            "max_tokens": 16384,
            "temperature": 0.60,
            "top_p": 0.95,
            "stream": false,
            "chat_template_kwargs": { "enable_thinking": true }
        };

        try {
            // Using native fetch since axios is not in package.json, 
            // but logic reflects the provided axios payload exactly.
            const response = await fetch(invokeUrl, {
                method: "POST",
                headers: headers,
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`HTTP ${response.status}: ${text}`);
            }

            const data = await response.json();
            return data?.choices?.[0]?.message?.content || "";
        } catch (error: any) {
            console.error(error);
            throw error;
        }
    }
}
