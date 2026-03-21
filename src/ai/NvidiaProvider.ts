import { AIProvider, Message } from "../types/ai";

export class NvidiaProvider implements AIProvider {
    private invokeUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
    private apiKey: string;
    private model: string;

    constructor(apiKey: string, modelId: string) {
        this.apiKey = apiKey;
        this.model = modelId;
    }

    async generateResponse(history: Message[], prompt: string): Promise<string> {
        const payload = {
            model: this.model,
            messages: [...history, { role: "user", content: prompt }],
            max_tokens: 16384,
            temperature: 0.60,
            top_p: 0.95,
            stream: false,
            chat_template_kwargs: { enable_thinking: true },
        };

        const headers = {
            "Authorization": `Bearer ${this.apiKey}`,
            "Accept": "application/json",
            "Content-Type": "application/json"
        };

        const response = await fetch(this.invokeUrl, {
            method: "POST",
            headers,
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("Nvidia Provider Error:\n", errorText);
            throw new Error(`Nvidia API error: ${response.status}`);
        }

        const data = await response.json() as any;
        return data.choices?.[0]?.message?.content || "";
    }
}
