import { Provider } from "../index.js";

export interface AvailableModelInfo {
    provider: string;
    model: string;
    source: "provider-api" | "catalog" | "configured";
    refreshedAt: number;
    cooldownUntil?: number;
    failureCount: number;
    lastError?: string;
}

export interface RefreshProviderResult {
    provider: string;
    models: AvailableModelInfo[];
    refreshedAt: number;
}

export interface ModelAvailabilityOptions {
    defaultCooldownMs?: number;
}

export class ModelAvailabilityManager {
    private readonly modelState = new Map<string, AvailableModelInfo>();
    private readonly defaultCooldownMs: number;
    private refreshTimer?: NodeJS.Timeout;

    constructor(options: ModelAvailabilityOptions = {}) {
        this.defaultCooldownMs = options.defaultCooldownMs ?? 60_000;
    }

    public upsertModels(provider: string, models: string[], source: AvailableModelInfo["source"]): RefreshProviderResult {
        const refreshedAt = Date.now();
        const updated: AvailableModelInfo[] = [];

        for (const model of models) {
            const key = this.key(provider, model);
            const previous = this.modelState.get(key);
            const next: AvailableModelInfo = {
                provider,
                model,
                source,
                refreshedAt,
                cooldownUntil: previous?.cooldownUntil,
                failureCount: previous?.failureCount ?? 0,
                lastError: previous?.lastError
            };
            this.modelState.set(key, next);
            updated.push(next);
        }

        return { provider, models: updated, refreshedAt };
    }

    public markFailure(provider: string, model: string, error: unknown, cooldownMs?: number): void {
        const key = this.key(provider, model);
        const current = this.modelState.get(key);
        const until = Date.now() + (cooldownMs ?? this.defaultCooldownMs);
        const message = error instanceof Error ? error.message : String(error);

        this.modelState.set(key, {
            provider,
            model,
            source: current?.source ?? "configured",
            refreshedAt: current?.refreshedAt ?? Date.now(),
            cooldownUntil: until,
            failureCount: (current?.failureCount ?? 0) + 1,
            lastError: message
        });
    }

    public clearCooldown(provider: string, model: string): void {
        const key = this.key(provider, model);
        const current = this.modelState.get(key);
        if (!current) return;

        this.modelState.set(key, {
            ...current,
            cooldownUntil: undefined,
            lastError: undefined
        });
    }

    public isOnCooldown(provider: string, model: string): boolean {
        const state = this.modelState.get(this.key(provider, model));
        if (!state?.cooldownUntil) return false;
        return state.cooldownUntil > Date.now();
    }

    public listModels(provider?: string, includeCooldown: boolean = true): AvailableModelInfo[] {
        const now = Date.now();
        return Array.from(this.modelState.values()).filter((entry) => {
            if (provider && entry.provider !== provider) return false;
            if (includeCooldown) return true;
            return !entry.cooldownUntil || entry.cooldownUntil <= now;
        });
    }

    public chooseModel(provider: string, preferredModel?: string): string | null {
        if (preferredModel && !this.isOnCooldown(provider, preferredModel)) {
            return preferredModel;
        }

        const candidates = this.listModels(provider, false);
        if (candidates.length === 0) return null;

        candidates.sort((a, b) => a.failureCount - b.failureCount || b.refreshedAt - a.refreshedAt);
        return candidates[0].model;
    }

    public async refreshFromProvider(
        providerName: string,
        provider: Provider,
        fallbackModels: string[] = []
    ): Promise<RefreshProviderResult> {
        try {
            if (provider.listAvailableModels) {
                const models = await provider.listAvailableModels();
                if (models.length > 0) {
                    return this.upsertModels(providerName, dedupe(models), "provider-api");
                }
            }
        } catch {
            // fall through to fallback
        }

        if (fallbackModels.length > 0) {
            return this.upsertModels(providerName, dedupe(fallbackModels), "catalog");
        }

        const active = provider.getModelLimits().model;
        return this.upsertModels(providerName, [active], "configured");
    }

    public startAutoRefresh(refreshFn: () => Promise<void>, intervalMs: number = 60_000): void {
        this.stopAutoRefresh();
        this.refreshTimer = setInterval(() => {
            void refreshFn();
        }, intervalMs);
    }

    public stopAutoRefresh(): void {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = undefined;
        }
    }

    private key(provider: string, model: string): string {
        return `${provider}:${model}`;
    }
}

function dedupe(items: string[]): string[] {
    return Array.from(new Set(items.filter(Boolean)));
}
