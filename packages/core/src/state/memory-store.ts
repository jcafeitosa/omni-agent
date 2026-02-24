import * as fs from "node:fs/promises";

export interface MemoryRecord {
    id: string;
    namespace: string;
    key: string;
    value: string;
    tier?: "hot" | "deep";
    createdAt: number;
    updatedAt: number;
    expiresAt?: number;
    metadata?: Record<string, any>;
}

export interface MemoryStoreOptions {
    filePath?: string;
}

function now(): number {
    return Date.now();
}

function makeId(namespace: string, key: string): string {
    return `${namespace}:${key}`;
}

export class MemoryStore {
    private readonly filePath?: string;
    private records = new Map<string, MemoryRecord>();

    constructor(options: MemoryStoreOptions = {}) {
        this.filePath = options.filePath;
    }

    public async load(): Promise<void> {
        if (!this.filePath) return;
        try {
            const raw = await fs.readFile(this.filePath, "utf8");
            const parsed = JSON.parse(raw) as { records?: MemoryRecord[] };
            this.records.clear();
            for (const record of parsed.records || []) {
                this.records.set(record.id, record);
            }
            this.compactExpired();
        } catch (error: any) {
            if (error?.code === "ENOENT") return;
            throw error;
        }
    }

    public async save(): Promise<void> {
        if (!this.filePath) return;
        this.compactExpired();
        const payload = {
            version: 1,
            records: Array.from(this.records.values())
        };
        await fs.writeFile(this.filePath, JSON.stringify(payload, null, 2), "utf8");
    }

    public remember(
        namespace: string,
        key: string,
        value: string,
        options: { ttlMs?: number; metadata?: Record<string, any>; tier?: "hot" | "deep" } = {}
    ): MemoryRecord {
        const id = makeId(namespace, key);
        const existing = this.records.get(id);
        const timestamp = now();
        const record: MemoryRecord = {
            id,
            namespace,
            key,
            value,
            tier: options.tier || existing?.tier || "deep",
            createdAt: existing?.createdAt ?? timestamp,
            updatedAt: timestamp,
            expiresAt: options.ttlMs ? timestamp + options.ttlMs : undefined,
            metadata: options.metadata
        };
        this.records.set(id, record);
        return record;
    }

    public recall(namespace: string, key: string): MemoryRecord | undefined {
        this.compactExpired();
        return this.records.get(makeId(namespace, key));
    }

    public forget(namespace: string, key: string): boolean {
        return this.records.delete(makeId(namespace, key));
    }

    public list(namespace?: string): MemoryRecord[] {
        this.compactExpired();
        const values = Array.from(this.records.values());
        if (!namespace) return values;
        return values.filter((r) => r.namespace === namespace);
    }

    public listByTier(tier: "hot" | "deep", namespace?: string): MemoryRecord[] {
        return this.list(namespace).filter((record) => (record.tier || "deep") === tier);
    }

    public rememberHot(namespace: string, key: string, value: string, options: { ttlMs?: number; metadata?: Record<string, any> } = {}): MemoryRecord {
        return this.remember(namespace, key, value, { ...options, tier: "hot" });
    }

    public rememberDeep(namespace: string, key: string, value: string, options: { ttlMs?: number; metadata?: Record<string, any> } = {}): MemoryRecord {
        return this.remember(namespace, key, value, { ...options, tier: "deep" });
    }

    public promoteToHot(namespace: string, key: string, options: { ttlMs?: number } = {}): MemoryRecord | undefined {
        const current = this.recall(namespace, key);
        if (!current) return undefined;
        return this.remember(namespace, key, current.value, {
            ttlMs: options.ttlMs,
            metadata: current.metadata,
            tier: "hot"
        });
    }

    public demoteToDeep(namespace: string, key: string): MemoryRecord | undefined {
        const current = this.recall(namespace, key);
        if (!current) return undefined;
        return this.remember(namespace, key, current.value, {
            metadata: current.metadata,
            tier: "deep"
        });
    }

    public search(namespace: string, query: string, limit = 10): MemoryRecord[] {
        this.compactExpired();
        const q = query.trim().toLowerCase();
        if (!q) {
            return this.list(namespace).slice(0, limit);
        }
        return this.list(namespace)
            .filter((record) => {
                const haystack = `${record.key}\n${record.value}\n${JSON.stringify(record.metadata || {})}`.toLowerCase();
                return haystack.includes(q);
            })
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .slice(0, limit);
    }

    public compactExpired(): void {
        const timestamp = now();
        for (const [id, record] of this.records.entries()) {
            if (record.expiresAt && record.expiresAt <= timestamp) {
                this.records.delete(id);
            }
        }
    }
}
