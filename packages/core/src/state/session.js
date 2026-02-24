import { EventBus } from "../events/event-bus.js";
export class AgentSession {
    messages = [];
    systemPrompt;
    eventBus;
    // Advanced Flow Queues (Ported from pi-mono)
    _steeringMessages = [];
    _followUpMessages = [];
    _pendingNextTurnMessages = [];
    constructor(options = {}) {
        this.systemPrompt = options.systemPrompt || "You are OmniAgent, a helpful AI.";
        this.eventBus = new EventBus();
    }
    getSystemPrompt() {
        return this.systemPrompt;
    }
    setSystemPrompt(prompt) {
        this.systemPrompt = prompt;
    }
    getMessages() {
        return this.messages;
    }
    addMessage(message) {
        this.messages.push(message);
        this.eventBus.emit("messageAppended", { message });
    }
    /**
     * Queue a steering message to interrupt the agent mid-run.
     * Delivered after current tool execution, skips remaining tools.
     */
    async steer(text) {
        this._steeringMessages.push(text);
        this.addMessage({ role: "user", text, content: text, isSteering: true });
        this.eventBus.emit("steerRequested", { text });
    }
    /**
     * Queue a follow-up message to be processed after the agent finishes.
     * Delivered only when agent has no more tool calls or steering messages.
     */
    async followUp(text) {
        this._followUpMessages.push(text);
        this.addMessage({ role: "user", text, content: text, isFollowUp: true });
        this.eventBus.emit("followUpRequested", { text });
    }
    /**
     * Flush queues. Called by the AgentLoop when preparing the next turn.
     */
    consumeQueues() {
        const steering = [...this._steeringMessages];
        const followUp = [...this._followUpMessages];
        this._steeringMessages = [];
        this._followUpMessages = [];
        return { steering, followUp };
    }
    get pendingMessageCount() {
        return this._steeringMessages.length + this._followUpMessages.length;
    }
}
