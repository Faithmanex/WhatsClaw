export interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

export interface AIProvider {
    generateResponse(history: Message[], prompt: string): Promise<string>;
}
