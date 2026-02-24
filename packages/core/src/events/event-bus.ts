/**
 * EventBus Implementation (Inspired by pi-mono ExtensionRuntime & gemini-cli Telemetry/Hooks)
 * Provides a strongly typed way for plugins, tools, and the host to subscribe to Agent events.
 */

export type EventHandler<T> = (data: T) => void | Promise<void>;

export class EventBus<Events extends Record<string, any>> {
    private listeners: { [K in keyof Events]?: Set<EventHandler<Events[K]>> } = {};

    /**
     * Subscribes to an event
     */
    public on<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): () => void {
        if (!this.listeners[event]) {
            this.listeners[event] = new Set();
        }
        this.listeners[event]!.add(handler);

        // Return an unsubscribe function
        return () => this.off(event, handler);
    }

    /**
     * Unsubscribes from an event
     */
    public off<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): void {
        const handlers = this.listeners[event];
        if (handlers) {
            handlers.delete(handler);
        }
    }

    /**
     * Emits an event to all subscribers sequentially
     * (to guarantee order of operations if they are async)
     */
    public async emit<K extends keyof Events>(event: K, data: Events[K]): Promise<void> {
        const handlers = this.listeners[event];
        if (handlers) {
            for (const handler of Array.from(handlers)) {
                await handler(data);
            }
        }
    }
}
