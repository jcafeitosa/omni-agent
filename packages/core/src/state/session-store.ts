import * as fs from "node:fs/promises";
import { dirname } from "node:path";
import { AgentSession } from "./session.js";

export interface SessionStoreOptions {
    filePath: string;
}

export class SessionStore {
    private readonly filePath: string;

    constructor(options: SessionStoreOptions) {
        this.filePath = options.filePath;
    }

    public async load(): Promise<AgentSession | null> {
        try {
            const raw = await fs.readFile(this.filePath, "utf8");
            const parsed = JSON.parse(raw);
            return AgentSession.fromJSON(parsed);
        } catch {
            return null;
        }
    }

    public async save(session: AgentSession): Promise<void> {
        await fs.mkdir(dirname(this.filePath), { recursive: true });
        await fs.writeFile(this.filePath, JSON.stringify(session.toJSON(), null, 2), "utf8");
    }
}

