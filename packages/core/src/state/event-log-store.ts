import * as fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

export interface EventLogEntry {
    ts: number;
    type: string;
    subtype?: string;
    threadId?: string;
    payload: any;
}

export interface EventLogStoreOptions {
    filePath: string;
    batchSize?: number;
    flushIntervalMs?: number;
    retentionDays?: number;
}

export class EventLogStore {
    private readonly filePath: string;
    private readonly batchSize: number;
    private readonly flushIntervalMs: number;
    private readonly retentionDays: number;
    private buffer: EventLogEntry[] = [];
    private flushTimer?: NodeJS.Timeout;
    private flushing = false;

    constructor(options: EventLogStoreOptions) {
        this.filePath = options.filePath;
        this.batchSize = options.batchSize ?? 64;
        this.flushIntervalMs = options.flushIntervalMs ?? 250;
        this.retentionDays = options.retentionDays ?? 90;
    }

    public async append(entry: EventLogEntry): Promise<void> {
        this.buffer.push(entry);
        if (this.buffer.length >= this.batchSize) {
            await this.flush();
            return;
        }
        this.ensureTimer();
    }

    public async flush(): Promise<void> {
        if (this.flushing) return;
        if (this.buffer.length === 0) return;
        this.flushing = true;
        try {
            const pending = this.buffer.splice(0, this.buffer.length);
            await fs.mkdir(dirname(this.filePath), { recursive: true });
            const payload = pending.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
            await fs.appendFile(this.filePath, payload, "utf8");
        } finally {
            this.flushing = false;
        }
    }

    public async compactRetention(now = Date.now()): Promise<void> {
        if (!existsSync(this.filePath)) return;
        const cutoff = now - this.retentionDays * 24 * 60 * 60 * 1000;
        const raw = await fs.readFile(this.filePath, "utf8");
        const keptLines: string[] = [];
        for (const line of raw.split("\n")) {
            if (!line.trim()) continue;
            try {
                const parsed = JSON.parse(line) as EventLogEntry;
                if ((parsed.ts || 0) >= cutoff) {
                    keptLines.push(JSON.stringify(parsed));
                }
            } catch {
                // skip malformed line
            }
        }
        const content = keptLines.length ? `${keptLines.join("\n")}\n` : "";
        await fs.writeFile(this.filePath, content, "utf8");
    }

    public async exportJsonl(outputPath: string): Promise<void> {
        await this.flush();
        if (!existsSync(this.filePath)) {
            await fs.writeFile(outputPath, "", "utf8");
            return;
        }
        const content = await fs.readFile(this.filePath, "utf8");
        await fs.writeFile(outputPath, content, "utf8");
    }

    public async shutdown(): Promise<void> {
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = undefined;
        }
        await this.flush();
    }

    private ensureTimer(): void {
        if (this.flushTimer) return;
        this.flushTimer = setTimeout(async () => {
            this.flushTimer = undefined;
            await this.flush();
        }, this.flushIntervalMs);
    }
}
