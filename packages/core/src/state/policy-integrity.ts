import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import { dirname, resolve } from "node:path";

export type IntegrityStatus = "MATCH" | "MISMATCH" | "NEW";

export interface IntegrityResult {
    status: IntegrityStatus;
    hash: string;
}

interface IntegrityStore {
    [key: string]: string;
}

export interface PolicyIntegrityManagerOptions {
    storagePath?: string;
}

export class PolicyIntegrityManager {
    private readonly storagePath: string;

    constructor(options: PolicyIntegrityManagerOptions = {}) {
        this.storagePath = resolve(options.storagePath || ".omniagent/policy-integrity.json");
    }

    public getStoragePath(): string {
        return this.storagePath;
    }

    public async checkIntegrity(scope: string, identifier: string, payload: unknown): Promise<IntegrityResult> {
        const hash = computeIntegrityHash(payload);
        const key = `${scope}:${identifier}`;
        const store = await this.readStore();
        const prev = store[key];
        if (!prev) return { status: "NEW", hash };
        if (prev === hash) return { status: "MATCH", hash };
        return { status: "MISMATCH", hash };
    }

    public async acceptIntegrity(scope: string, identifier: string, hash: string): Promise<void> {
        const key = `${scope}:${identifier}`;
        const store = await this.readStore();
        store[key] = hash;
        await this.writeStore(store);
    }

    private async readStore(): Promise<IntegrityStore> {
        if (!existsSync(this.storagePath)) return {};
        try {
            const parsed = JSON.parse(await fs.readFile(this.storagePath, "utf8")) as Record<string, unknown>;
            const out: IntegrityStore = {};
            for (const [k, v] of Object.entries(parsed || {})) {
                if (typeof v === "string") out[k] = v;
            }
            return out;
        } catch {
            return {};
        }
    }

    private async writeStore(store: IntegrityStore): Promise<void> {
        await fs.mkdir(dirname(this.storagePath), { recursive: true });
        await fs.writeFile(this.storagePath, JSON.stringify(store, null, 2), "utf8");
    }
}

export function computeIntegrityHash(payload: unknown): string {
    const canonical = stableStringify(payload);
    return createHash("sha256").update(canonical).digest("hex");
}

function stableStringify(value: unknown): string {
    return JSON.stringify(sortObject(value));
}

function sortObject(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sortObject);
    if (!value || typeof value !== "object") return value;
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
        out[key] = sortObject(obj[key]);
    }
    return out;
}
