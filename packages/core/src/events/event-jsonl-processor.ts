import * as fs from "node:fs/promises";
import type { EventLogEntry } from "../state/event-log-store.js";

export interface EventFilter {
    type?: string;
    subtype?: string;
    fromTs?: number;
    toTs?: number;
    threadId?: string;
}

export interface EventSummary {
    total: number;
    byType: Record<string, number>;
    bySubtype: Record<string, number>;
    minTs?: number;
    maxTs?: number;
}

export class EventJsonlProcessor {
    public static async readFile(filePath: string): Promise<EventLogEntry[]> {
        const content = await fs.readFile(filePath, "utf8");
        return this.parse(content);
    }

    public static parse(content: string): EventLogEntry[] {
        const events: EventLogEntry[] = [];
        for (const line of content.split("\n")) {
            const raw = line.trim();
            if (!raw) continue;
            try {
                const parsed = JSON.parse(raw) as EventLogEntry;
                if (typeof parsed.ts !== "number" || typeof parsed.type !== "string") continue;
                events.push(parsed);
            } catch {
                // ignore malformed lines
            }
        }
        return events;
    }

    public static filter(events: EventLogEntry[], filter: EventFilter): EventLogEntry[] {
        return events.filter((event) => {
            if (filter.type && event.type !== filter.type) return false;
            if (filter.subtype && event.subtype !== filter.subtype) return false;
            if (filter.threadId && event.threadId !== filter.threadId) return false;
            if (filter.fromTs !== undefined && event.ts < filter.fromTs) return false;
            if (filter.toTs !== undefined && event.ts > filter.toTs) return false;
            return true;
        });
    }

    public static summarize(events: EventLogEntry[]): EventSummary {
        const byType: Record<string, number> = {};
        const bySubtype: Record<string, number> = {};
        let minTs: number | undefined;
        let maxTs: number | undefined;

        for (const event of events) {
            byType[event.type] = (byType[event.type] || 0) + 1;
            if (event.subtype) {
                bySubtype[event.subtype] = (bySubtype[event.subtype] || 0) + 1;
            }
            if (minTs === undefined || event.ts < minTs) minTs = event.ts;
            if (maxTs === undefined || event.ts > maxTs) maxTs = event.ts;
        }

        return {
            total: events.length,
            byType,
            bySubtype,
            minTs,
            maxTs
        };
    }
}
