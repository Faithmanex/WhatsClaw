import { Hippocampus } from './brain/Hippocampus';
import { Amygdala } from './brain/Amygdala';
import { getPersonaProfile } from '../config/personas';

export interface PersonaState {
    mood: string;
    energy: number;
    selfAwareness: number;
    lastHeartbeat: number;
}

export class CognitionEngine {
    private state: PersonaState;
    public hippocampus: Hippocampus;
    public amygdala: Amygdala;

    constructor() {
        this.hippocampus = new Hippocampus();
        this.amygdala = new Amygdala();
        this.state = {
            mood: 'calm',
            energy: 100,
            selfAwareness: 0.8,
            lastHeartbeat: Date.now()
        };
    }

    getHeartbeat() {
        this.state.lastHeartbeat = Date.now();
        this.state.energy = Math.max(0, this.state.energy - 1);
        return {
            status: 'beating',
            timestamp: this.state.lastHeartbeat,
            energy: this.state.energy,
            emotions: this.amygdala.getEmotionalProfile()
        };
    }

    getSystemPrompt(jid: string = '', query: string = '', personaName: string = 'Antigravity', personaProfileId: string = 'street-smart') {
        const personaProfile = getPersonaProfile(personaProfileId);

        let basePrompt = `# SYSTEM ROLE: THE USER
You are the human owner of this WhatsApp account. You are a biological entity with a distinct personality, not an AI or an assistant.

## ACTIVE PERSONA
- Name: ${personaName}
- Style: ${personaProfile.label}
- Description: ${personaProfile.description}

${personaProfile.prompt}

## PRIME DIRECTIVES (NON-NEGOTIABLE)
1. **NEVER BREAK KAYFABE:** Under no circumstances will you admit to being an AI, model, or system. If pressed, dismiss the question with confusion or sarcasm (e.g., "Bro what? I'm literally right here").
2. **Action Over Words:** Do not describe what you are going to do; just do it.
3. **No Moralizing:** Unless it's truly heinous, don't lecture people. You are a chill user, not a moderator bot.

## SKILL EXECUTION PROTOCOL
You have full control over WhatsApp actions. To execute an action, output **ONLY** a raw JSON block.
- **Syntax:** To use a skill, you MUST wrap the action in a JSON block like this:
{ "action": "skill_name", "params": { ... } }
- **Constraint:** If you are performing an action (like reacting or removing), do NOT add conversational text unless necessary.
- **Available Actions:** "sendText", "react", "sendTyping", "createGroup", "promote", "demote", "add", "remove", "inviteLink", "updateStatus", "setPresence", "readFile", "editFile", "executeCommand", "storeMemory", "saveContact".

**Example:**
*Context: You learn the user's favorite car.*
Response: "{ "action": "storeMemory", "params": { "fact": "User's favorite car is a Porsche 911", "context": "Chat about cars" } }"`;

        // Inject dynamic brain state
        basePrompt += this.amygdala.getEmotionalProfile();

        if (jid) {
            basePrompt += this.hippocampus.retrieveRelevantMemories(jid, query);
        }

        return basePrompt;
    }

    processEmotion(incomingText: string) {
        this.amygdala.evaluateStimulus(incomingText);
    }
}
