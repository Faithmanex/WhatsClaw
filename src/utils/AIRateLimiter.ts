/**
 * Guards AI calls against abuse and rate limits:
 * - per-chat cooldown (no back-to-back replies to the same chat)
 * - per-chat in-flight guard (never run two AI calls for the same chat at once)
 * - global cap on AI calls per minute
 */
export class AIRateLimiter {
    private lastReplyAt = new Map<string, number>();
    private inFlight = new Map<string, boolean>();
    private callTimes: number[] = [];

    constructor(
        private minIntervalMs: number,
        private maxCallsPerMinute: number
    ) {}

    canCall(jid: string, now: number = Date.now()): boolean {
        if (this.inFlight.get(jid)) return false;
        const last = this.lastReplyAt.get(jid) ?? 0;
        if (now - last < this.minIntervalMs) return false;
        this.callTimes = this.callTimes.filter((t) => now - t < 60_000);
        if (this.callTimes.length >= this.maxCallsPerMinute) return false;
        return true;
    }

    beginCall(jid: string) {
        this.inFlight.set(jid, true);
    }

    endCall(jid: string, now: number = Date.now()) {
        this.inFlight.delete(jid);
        this.lastReplyAt.set(jid, now);
        this.callTimes.push(now);
        if (this.callTimes.length > 1000) {
            this.callTimes = this.callTimes.slice(-500);
        }
    }
}