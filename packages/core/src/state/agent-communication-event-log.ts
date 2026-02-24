import * as fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { AgentCommunicationEvent, AgentCommunicationHub } from "./agent-communication.js";

export interface AgentCommunicationEventEnvelope {
    seq: number;
    recordedAt: number;
    event: AgentCommunicationEvent;
}

export interface AgentCommunicationEventLogOptions {
    filePath?: string;
    retentionDays?: number;
    maxEntries?: number;
}

export class AgentCommunicationEventLog {
    private readonly filePath: string;
    private readonly retentionDays: number;
    private readonly maxEntries: number;
    private nextSeqHint = 0;

    constructor(options: AgentCommunicationEventLogOptions = {}) {
        this.filePath = resolve(options.filePath || ".omniagent/communication-events.jsonl");
        this.retentionDays = options.retentionDays ?? 30;
        this.maxEntries = options.maxEntries ?? 100_000;
    }

    public async append(event: AgentCommunicationEvent): Promise<AgentCommunicationEventEnvelope> {
        const seq = await this.nextSeq();
        const envelope: AgentCommunicationEventEnvelope = {
            seq,
            recordedAt: Date.now(),
            event
        };
        await fs.mkdir(dirname(this.filePath), { recursive: true });
        await fs.appendFile(this.filePath, `${JSON.stringify(envelope)}\n`, "utf8");
        return envelope;
    }

    public async readAll(): Promise<AgentCommunicationEventEnvelope[]> {
        try {
            const raw = await fs.readFile(this.filePath, "utf8");
            const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
            const parsed: AgentCommunicationEventEnvelope[] = [];
            for (const line of lines) {
                try {
                    const item = JSON.parse(line) as AgentCommunicationEventEnvelope;
                    if (!item || typeof item.seq !== "number" || !item.event) continue;
                    parsed.push(item);
                } catch {
                    // skip malformed lines to keep log append-only and resilient
                }
            }
            parsed.sort((a, b) => a.seq - b.seq);
            this.nextSeqHint = Math.max(this.nextSeqHint, parsed.length ? parsed[parsed.length - 1].seq : 0);
            return parsed;
        } catch {
            return [];
        }
    }

    public async replayInto(
        hub: AgentCommunicationHub,
        options: { fromSeqExclusive?: number; continueOnError?: boolean } = {}
    ): Promise<{ applied: number; failed: number; lastSeq: number }> {
        const fromSeq = Number(options.fromSeqExclusive || 0);
        const continueOnError = options.continueOnError ?? true;
        const events = await this.readAll();
        let applied = 0;
        let failed = 0;
        let lastSeq = fromSeq;
        for (const envelope of events) {
            if (envelope.seq <= fromSeq) continue;
            try {
                hub.applyEvent(envelope.event);
                applied += 1;
            } catch {
                failed += 1;
                if (!continueOnError) throw new Error(`Failed to replay event seq=${envelope.seq}`);
            }
            if (envelope.seq > lastSeq) lastSeq = envelope.seq;
        }
        return { applied, failed, lastSeq };
    }

    public async compact(options: { now?: number; retentionDays?: number; maxEntries?: number } = {}): Promise<{
        before: number;
        after: number;
    }> {
        const now = options.now ?? Date.now();
        const retentionDays = options.retentionDays ?? this.retentionDays;
        const maxEntries = options.maxEntries ?? this.maxEntries;
        const all = await this.readAll();
        const before = all.length;
        if (before === 0) return { before, after: 0 };

        const cutoff = now - retentionDays * 24 * 60 * 60 * 1000;
        let kept = all.filter((entry) => entry.recordedAt >= cutoff);
        if (kept.length > maxEntries) {
            kept = kept.slice(kept.length - maxEntries);
        }
        const content = kept.length ? `${kept.map((item) => JSON.stringify(item)).join("\n")}\n` : "";
        await fs.mkdir(dirname(this.filePath), { recursive: true });
        await fs.writeFile(this.filePath, content, "utf8");
        this.nextSeqHint = kept.length ? kept[kept.length - 1].seq : 0;
        return { before, after: kept.length };
    }

    public async exportJsonl(outputPath: string): Promise<void> {
        if (!existsSync(this.filePath)) {
            await fs.writeFile(outputPath, "", "utf8");
            return;
        }
        const content = await fs.readFile(this.filePath, "utf8");
        await fs.writeFile(outputPath, content, "utf8");
    }

    private async nextSeq(): Promise<number> {
        if (this.nextSeqHint <= 0) {
            const all = await this.readAll();
            this.nextSeqHint = all.length ? all[all.length - 1].seq : 0;
        }
        this.nextSeqHint += 1;
        return this.nextSeqHint;
    }
}
