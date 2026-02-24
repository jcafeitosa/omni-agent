import type * as http from "node:http";
import {
    AgentCommunicationDomainEvent,
    AgentCommunicationHub
} from "./agent-communication.js";

export interface CommunicationRealtimeFilter {
    workspaceId?: string;
    channelId?: string;
}

export interface CommunicationRealtimeClient {
    id: string;
    filter: CommunicationRealtimeFilter;
    onEvent: (event: AgentCommunicationDomainEvent) => void;
}

export interface CommunicationSseClient {
    id: string;
    close: () => void;
}

export class AgentCommunicationRealtimeGateway {
    private clients = new Map<string, CommunicationRealtimeClient>();
    private unsubscribeHub?: () => void;
    private idCounter = 0;

    public bindHub(hub: AgentCommunicationHub): void {
        if (this.unsubscribeHub) this.unsubscribeHub();
        this.unsubscribeHub = hub.onEvent((event) => this.publish(event));
    }

    public close(): void {
        if (this.unsubscribeHub) {
            this.unsubscribeHub();
            this.unsubscribeHub = undefined;
        }
        this.clients.clear();
    }

    public subscribe(filter: CommunicationRealtimeFilter, onEvent: (event: AgentCommunicationDomainEvent) => void): () => void {
        const id = this.nextId();
        this.clients.set(id, { id, filter, onEvent });
        return () => this.clients.delete(id);
    }

    public attachSseClient(
        req: http.IncomingMessage,
        res: http.ServerResponse,
        filter: CommunicationRealtimeFilter = {}
    ): CommunicationSseClient {
        const id = this.nextId();
        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "Access-Control-Allow-Origin": "*"
        });
        res.write(`event: ready\ndata: ${JSON.stringify({ clientId: id })}\n\n`);

        const unsubscribe = this.subscribe(filter, (event) => {
            res.write(this.toSse(event));
        });

        const keepAlive = setInterval(() => {
            res.write(": keepalive\n\n");
        }, 15_000);

        const close = () => {
            clearInterval(keepAlive);
            unsubscribe();
            if (!res.writableEnded) res.end();
        };

        req.on("close", close);
        return { id, close };
    }

    public publish(event: AgentCommunicationDomainEvent): number {
        let delivered = 0;
        for (const client of this.clients.values()) {
            if (!matchesFilter(event, client.filter)) continue;
            try {
                client.onEvent(event);
                delivered += 1;
            } catch {
                this.clients.delete(client.id);
            }
        }
        return delivered;
    }

    public toSse(event: AgentCommunicationDomainEvent): string {
        return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
    }

    private nextId(): string {
        this.idCounter += 1;
        return `comm_rt_${this.idCounter}`;
    }
}

function matchesFilter(event: AgentCommunicationDomainEvent, filter: CommunicationRealtimeFilter): boolean {
    if (filter.workspaceId && event.workspaceId !== filter.workspaceId) return false;
    if (!filter.channelId) return true;
    if (event.type === "message_posted") return event.channelId === filter.channelId;
    if (event.type === "reaction_added") return event.channelId === filter.channelId;
    if (event.type === "channel_joined") return event.channelId === filter.channelId;
    return false;
}
