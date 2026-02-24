import { AgentMessage, ToolCall } from "../types/messages.js";
import { EventBus } from "../events/event-bus.js";

interface AgentSessionOptions {
    systemPrompt?: string;
}

export interface Usage {
    inputTokens: number;
    outputTokens: number;
    thinkingTokens?: number;
}

export class AgentSession {
    private messages: AgentMessage[] = [];
    private systemPrompt: string;
    public readonly eventBus: EventBus<any>;

    private usage: Usage = { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 };

    // Advanced Flow Queues (Ported from pi-mono)
    private _steeringMessages: string[] = [];
    private _followUpMessages: string[] = [];
    private _pendingNextTurnMessages: any[] = [];

    constructor(options: AgentSessionOptions = {}) {
        this.systemPrompt = options.systemPrompt || "You are OmniAgent, a helpful AI.";
        this.eventBus = new EventBus();
    }

    getSystemPrompt(): string {
        return this.systemPrompt;
    }

    setSystemPrompt(prompt: string): void {
        this.systemPrompt = prompt;
    }

    getMessages(): AgentMessage[] {
        return this.messages;
    }

    addMessage(message: AgentMessage): void {
        this.messages.push(message);
        this.eventBus.emit("messageAppended", { message });
    }

    addUsage(usage: Usage): void {
        this.usage.inputTokens += usage.inputTokens;
        this.usage.outputTokens += usage.outputTokens;
        this.usage.thinkingTokens = (this.usage.thinkingTokens || 0) + (usage.thinkingTokens || 0);
        this.eventBus.emit("usageUpdated", { usage: this.usage });
    }

    getUsage(): Usage {
        return this.usage;
    }

    /**
     * Approximate cost calculation in USD.
     * Approximate default rates used when provider-specific pricing is unavailable.
     */
    calculateApproximateCost(): number {
        const inputRate = 3 / 1_000_000;  // $3 per 1M tokens
        const outputRate = 15 / 1_000_000; // $15 per 1M tokens
        return (this.usage.inputTokens * inputRate) + (this.usage.outputTokens * outputRate);
    }

    /**
     * Queue a steering message to interrupt the agent mid-run.
     * Delivered after current tool execution, skips remaining tools.
     */
    async steer(text: string): Promise<void> {
        this._steeringMessages.push(text);
        this.addMessage({ role: "user", text, content: text, isSteering: true });
        this.eventBus.emit("steerRequested", { text });
    }

    /**
     * Queue a follow-up message to be processed after the agent finishes.
     * Delivered only when agent has no more tool calls or steering messages.
     */
    async followUp(text: string): Promise<void> {
        this._followUpMessages.push(text);
        this.addMessage({ role: "user", text, content: text, isFollowUp: true });
        this.eventBus.emit("followUpRequested", { text });
    }

    /**
     * Flush queues. Called by the AgentLoop when preparing the next turn.
     */
    consumeQueues(): { steering: string[]; followUp: string[] } {
        const steering = [...this._steeringMessages];
        const followUp = [...this._followUpMessages];
        this._steeringMessages = [];
        this._followUpMessages = [];
        return { steering, followUp };
    }

    get pendingMessageCount(): number {
        return this._steeringMessages.length + this._followUpMessages.length;
    }

    /**
     * Resets the session to its initial state.
     */
    clear(): void {
        this.messages = [];
        this.usage = { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 };
        this._steeringMessages = [];
        this._followUpMessages = [];
        this.eventBus.emit("sessionCleared", {});
    }

    /**
     * Serializes the session to a JSON-safe object.
     */
    toJSON(): any {
        return {
            messages: this.messages,
            systemPrompt: this.systemPrompt,
            usage: this.usage
        };
    }

    /**
     * Rehydrates a session from a JSON object.
     */
    static fromJSON(data: any): AgentSession {
        const session = new AgentSession({ systemPrompt: data.systemPrompt });
        session.messages = data.messages || [];
        session.usage = data.usage || { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 };
        return session;
    }
}
