import * as fs from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { AgentCommunicationHub, AgentCommunicationHubState } from "./agent-communication.js";

export interface AgentCommunicationStoreOptions {
    filePath?: string;
}

export interface AgentCommunicationSnapshotMeta {
    lastEventSeq: number;
}

export class AgentCommunicationStore {
    private readonly filePath: string;

    constructor(options: AgentCommunicationStoreOptions = {}) {
        this.filePath = resolve(options.filePath || ".omniagent/communication-state.json");
    }

    public async loadInto(hub: AgentCommunicationHub): Promise<AgentCommunicationSnapshotMeta> {
        try {
            const raw = await fs.readFile(this.filePath, "utf8");
            const parsed = JSON.parse(raw) as AgentCommunicationHubState & { lastEventSeq?: number };
            hub.importState(parsed);
            const lastEventSeq = Number.isFinite(parsed.lastEventSeq) ? Number(parsed.lastEventSeq) : 0;
            return { lastEventSeq: Math.max(0, Math.trunc(lastEventSeq)) };
        } catch {
            // empty/default state when file doesn't exist or parse fails
            return { lastEventSeq: 0 };
        }
    }

    public async saveFrom(hub: AgentCommunicationHub, options: AgentCommunicationSnapshotMeta = { lastEventSeq: 0 }): Promise<void> {
        const payload = {
            ...hub.exportState(),
            lastEventSeq: Math.max(0, Math.trunc(options.lastEventSeq || 0))
        };
        const out = JSON.stringify(payload, null, 2);
        await fs.mkdir(dirname(this.filePath), { recursive: true });
        const tmp = `${this.filePath}.tmp`;
        await fs.writeFile(tmp, out, "utf8");
        await fs.rename(tmp, this.filePath);
    }
}
