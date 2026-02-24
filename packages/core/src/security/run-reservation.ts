import * as fs from "node:fs/promises";
import { dirname } from "node:path";

export interface RunReservationRecord {
    key: string;
    status: "reserved" | "completed" | "failed";
    timestamp: string;
    owner?: string;
    metadata?: Record<string, any>;
}

export interface RunReservationOptions {
    staleAfterMs?: number;
}

export interface AcquireReservationResult {
    acquired: boolean;
    current: RunReservationRecord;
}

export class RunReservationManager {
    private readonly markerPath: string;
    private readonly staleAfterMs: number;

    constructor(markerPath: string, options: RunReservationOptions = {}) {
        this.markerPath = markerPath;
        this.staleAfterMs = options.staleAfterMs ?? 30 * 60 * 1000;
    }

    public async acquire(record: Omit<RunReservationRecord, "timestamp" | "status">): Promise<AcquireReservationResult> {
        await fs.mkdir(dirname(this.markerPath), { recursive: true });

        const next: RunReservationRecord = {
            key: record.key,
            owner: record.owner,
            metadata: record.metadata,
            status: "reserved",
            timestamp: new Date().toISOString()
        };

        try {
            await fs.writeFile(this.markerPath, JSON.stringify(next, null, 2), {
                encoding: "utf8",
                flag: "wx"
            });
            return { acquired: true, current: next };
        } catch (error: any) {
            if (error?.code !== "EEXIST") throw error;

            const existing = await this.read();
            if (!existing) {
                throw new Error("Reservation marker exists but cannot be read");
            }

            if (await this.isStale()) {
                await fs.writeFile(this.markerPath, JSON.stringify(next, null, 2), { encoding: "utf8" });
                return { acquired: true, current: next };
            }

            return { acquired: false, current: existing };
        }
    }

    public async markCompleted(metadata?: Record<string, any>): Promise<void> {
        const existing = await this.read();
        if (!existing) return;
        const next: RunReservationRecord = {
            ...existing,
            status: "completed",
            metadata: { ...(existing.metadata || {}), ...(metadata || {}) },
            timestamp: new Date().toISOString()
        };
        await fs.writeFile(this.markerPath, JSON.stringify(next, null, 2), "utf8");
    }

    public async markFailed(metadata?: Record<string, any>): Promise<void> {
        const existing = await this.read();
        if (!existing) return;
        const next: RunReservationRecord = {
            ...existing,
            status: "failed",
            metadata: { ...(existing.metadata || {}), ...(metadata || {}) },
            timestamp: new Date().toISOString()
        };
        await fs.writeFile(this.markerPath, JSON.stringify(next, null, 2), "utf8");
    }

    public async read(): Promise<RunReservationRecord | null> {
        try {
            const raw = await fs.readFile(this.markerPath, "utf8");
            return JSON.parse(raw) as RunReservationRecord;
        } catch (error: any) {
            if (error?.code === "ENOENT") return null;
            throw error;
        }
    }

    public async clear(): Promise<void> {
        try {
            await fs.unlink(this.markerPath);
        } catch (error: any) {
            if (error?.code !== "ENOENT") throw error;
        }
    }

    private async isStale(): Promise<boolean> {
        try {
            const stat = await fs.stat(this.markerPath);
            const age = Date.now() - stat.mtimeMs;
            return age > this.staleAfterMs;
        } catch (error: any) {
            if (error?.code === "ENOENT") return true;
            throw error;
        }
    }
}
