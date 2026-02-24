/**
 * EventBus Implementation (Inspired by pi-mono ExtensionRuntime & gemini-cli Telemetry/Hooks)
 * Provides a strongly typed way for plugins, tools, and the host to subscribe to Agent events.
 */
export class EventBus {
    listeners = {};
    /**
     * Subscribes to an event
     */
    on(event, handler) {
        if (!this.listeners[event]) {
            this.listeners[event] = new Set();
        }
        this.listeners[event].add(handler);
        // Return an unsubscribe function
        return () => this.off(event, handler);
    }
    /**
     * Unsubscribes from an event
     */
    off(event, handler) {
        const handlers = this.listeners[event];
        if (handlers) {
            handlers.delete(handler);
        }
    }
    /**
     * Emits an event to all subscribers sequentially
     * (to guarantee order of operations if they are async)
     */
    async emit(event, data) {
        const handlers = this.listeners[event];
        if (handlers) {
            for (const handler of Array.from(handlers)) {
                await handler(data);
            }
        }
    }
}
