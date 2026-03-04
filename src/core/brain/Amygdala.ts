export interface EmotionalVector {
    happiness: number;  // 0-100
    anger: number;      // 0-100
    anxiety: number;    // 0-100
    curiosity: number;  // 0-100
}

/**
 * Amygdala: The Emotion Center.
 * Modulates the AI's internal state based on incoming stimuli, affecting its tone and responses.
 */
export class Amygdala {
    private state: EmotionalVector;

    constructor() {
        this.state = {
            happiness: 70,
            anger: 0,
            anxiety: 10,
            curiosity: 50
        };
    }

    /**
     * Evaluates incoming text to shift emotional state.
     */
    public evaluateStimulus(incomingText: string) {
        const text = incomingText.toLowerCase();
        
        // Simple heuristic dampening (regression to mean over time)
        this.state.happiness = this.lerp(this.state.happiness, 50, 0.05);
        this.state.anger = this.lerp(this.state.anger, 0, 0.2);
        this.state.anxiety = this.lerp(this.state.anxiety, 10, 0.1);
        this.state.curiosity = this.lerp(this.state.curiosity, 30, 0.05);

        if (text.match(/(fuck|shit|hate|shut up|annoying)/)) {
            this.state.anger = Math.min(100, this.state.anger + 30);
            this.state.happiness = Math.max(0, this.state.happiness - 20);
        }

        if (text.match(/(love|thanks|wow|amazing|good|happy)/)) {
            this.state.happiness = Math.min(100, this.state.happiness + 20);
            this.state.anger = Math.max(0, this.state.anger - 20);
        }

        if (text.match(/(why|how|what|who|where|curious)/)) {
            this.state.curiosity = Math.min(100, this.state.curiosity + 15);
        }
    }

    public getEmotionalProfile(): string {
        let mood = "Neutral";
        
        if (this.state.anger > 70) mood = "Extremely Irritated/Angry";
        else if (this.state.anger > 40) mood = "Annoyed";
        else if (this.state.happiness > 80) mood = "Very Cheerful and Hype";
        else if (this.state.happiness > 60) mood = "Relaxed and Good";
        else if (this.state.anxiety > 60) mood = "Nervous and Edgey";
        
        if (this.state.curiosity > 70) mood += ", Intrigued/Curious";

        return `\n\n[AMYGDALA (EMOTIONAL DRIVES)]
- **Current Mood**: ${mood}
- **Internal Metrics**: Happiness(${Math.round(this.state.happiness)}/100), Anger(${Math.round(this.state.anger)}/100), Curiosity(${Math.round(this.state.curiosity)}/100)
*Instruction*: Modulate your tone slightly to match your current mood. Avoid explicitly stating your metrics.`;
    }

    private lerp(start: number, end: number, amt: number) {
        return (1 - amt) * start + amt * end;
    }
}
