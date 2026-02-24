export type ConnectorStrategy = "priority" | "lowest_cost" | "lowest_latency" | "round_robin" | "random";

export interface ConnectorDescriptor {
    id: string;
    capability: string;
    category?: string;
    provider?: string;
    endpoint?: string;
    priority?: number;
    enabled?: boolean;
    tags?: string[];
    costClass?: "low" | "medium" | "high";
    latencyClass?: "low" | "medium" | "high";
    metadata?: Record<string, unknown>;
}

interface ManagedConnector {
    descriptor: ConnectorDescriptor;
    cooldownUntil?: number;
    lastUsedAt?: number;
    failCount: number;
    successCount: number;
    lastError?: string;
}

export interface ConnectorRegistryState {
    version: 1;
    entries: Array<{
        descriptor: ConnectorDescriptor;
        cooldownUntil?: number;
        lastUsedAt?: number;
        failCount: number;
        successCount: number;
        lastError?: string;
    }>;
}

function scorePriority(connector: ManagedConnector): number {
    return connector.descriptor.priority ?? 100;
}

function classWeight(value: "low" | "medium" | "high" | undefined): number {
    if (value === "low") return 0;
    if (value === "medium") return 1;
    if (value === "high") return 2;
    return 3;
}

export class ConnectorRegistry {
    private readonly connectors = new Map<string, ManagedConnector>();
    private readonly rrIndex = new Map<string, number>();

    public upsert(connector: ConnectorDescriptor): void {
        const prev = this.connectors.get(connector.id);
        this.connectors.set(connector.id, {
            descriptor: {
                ...connector,
                enabled: connector.enabled !== false
            },
            cooldownUntil: prev?.cooldownUntil,
            lastUsedAt: prev?.lastUsedAt,
            failCount: prev?.failCount ?? 0,
            successCount: prev?.successCount ?? 0,
            lastError: prev?.lastError
        });
    }

    public importState(state: ConnectorRegistryState): void {
        if (!state || state.version !== 1 || !Array.isArray(state.entries)) return;
        this.connectors.clear();
        this.rrIndex.clear();
        for (const entry of state.entries) {
            if (!entry?.descriptor?.id) continue;
            this.connectors.set(entry.descriptor.id, {
                descriptor: {
                    ...entry.descriptor,
                    enabled: entry.descriptor.enabled !== false
                },
                cooldownUntil: entry.cooldownUntil,
                lastUsedAt: entry.lastUsedAt,
                failCount: entry.failCount ?? 0,
                successCount: entry.successCount ?? 0,
                lastError: entry.lastError
            });
        }
    }

    public exportState(): ConnectorRegistryState {
        return {
            version: 1,
            entries: Array.from(this.connectors.values()).map((entry) => ({
                descriptor: { ...entry.descriptor },
                cooldownUntil: entry.cooldownUntil,
                lastUsedAt: entry.lastUsedAt,
                failCount: entry.failCount,
                successCount: entry.successCount,
                lastError: entry.lastError
            }))
        };
    }

    public remove(id: string): boolean {
        return this.connectors.delete(id);
    }

    public listCapabilities(): string[] {
        return Array.from(new Set(Array.from(this.connectors.values()).map((c) => c.descriptor.capability))).sort((a, b) => a.localeCompare(b));
    }

    public listByCapability(capability: string, includeCoolingDown = false): ConnectorDescriptor[] {
        const now = Date.now();
        return this.collectAvailable(capability, now, includeCoolingDown).map((m) => ({ ...m.descriptor }));
    }

    public resolve(
        capability: string,
        options: { strategy?: ConnectorStrategy; includeCoolingDown?: boolean; excludeIds?: string[] } = {}
    ): ConnectorDescriptor | undefined {
        const strategy = options.strategy || "priority";
        const excluded = new Set(options.excludeIds || []);
        const now = Date.now();
        const pool = this.collectAvailable(capability, now, options.includeCoolingDown === true)
            .filter((entry) => !excluded.has(entry.descriptor.id));

        if (pool.length === 0) return undefined;

        let selected: ManagedConnector;
        switch (strategy) {
            case "lowest_cost":
                selected = [...pool].sort((a, b) => {
                    const byCost = classWeight(a.descriptor.costClass) - classWeight(b.descriptor.costClass);
                    if (byCost !== 0) return byCost;
                    return scorePriority(a) - scorePriority(b);
                })[0];
                break;
            case "lowest_latency":
                selected = [...pool].sort((a, b) => {
                    const byLatency = classWeight(a.descriptor.latencyClass) - classWeight(b.descriptor.latencyClass);
                    if (byLatency !== 0) return byLatency;
                    return scorePriority(a) - scorePriority(b);
                })[0];
                break;
            case "round_robin": {
                const sorted = [...pool].sort((a, b) => scorePriority(a) - scorePriority(b));
                const idx = this.rrIndex.get(capability) || 0;
                selected = sorted[idx % sorted.length];
                this.rrIndex.set(capability, (idx + 1) % sorted.length);
                break;
            }
            case "random":
                selected = pool[Math.floor(Math.random() * pool.length)];
                break;
            case "priority":
            default:
                selected = [...pool].sort((a, b) => scorePriority(a) - scorePriority(b))[0];
                break;
        }

        selected.lastUsedAt = now;
        return { ...selected.descriptor };
    }

    public setEnabled(id: string, enabled: boolean): void {
        const item = this.connectors.get(id);
        if (!item) return;
        item.descriptor.enabled = enabled;
    }

    public reportFailure(id: string, options: { cooldownMs?: number; error?: string } = {}): void {
        const item = this.connectors.get(id);
        if (!item) return;
        item.failCount += 1;
        if (options.error) {
            item.lastError = options.error;
        }
        if (options.cooldownMs && options.cooldownMs > 0) {
            item.cooldownUntil = Date.now() + options.cooldownMs;
        }
    }

    public reportSuccess(id: string): void {
        const item = this.connectors.get(id);
        if (!item) return;
        item.successCount += 1;
        item.cooldownUntil = undefined;
        item.lastError = undefined;
    }

    public getStats(id: string): {
        failCount: number;
        successCount: number;
        cooldownUntil?: number;
        lastUsedAt?: number;
        lastError?: string;
    } | undefined {
        const item = this.connectors.get(id);
        if (!item) return undefined;
        return {
            failCount: item.failCount,
            successCount: item.successCount,
            cooldownUntil: item.cooldownUntil,
            lastUsedAt: item.lastUsedAt,
            lastError: item.lastError
        };
    }

    private collectAvailable(capability: string, now: number, includeCoolingDown: boolean): ManagedConnector[] {
        const all = Array.from(this.connectors.values()).filter((entry) => entry.descriptor.capability === capability && entry.descriptor.enabled !== false);
        if (includeCoolingDown) return all;
        return all.filter((entry) => !entry.cooldownUntil || entry.cooldownUntil <= now);
    }
}
