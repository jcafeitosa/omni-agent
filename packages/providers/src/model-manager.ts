import { ModelAvailabilityManager, ProviderRegistry } from "@omni-agent/core";
import { listModelCatalog } from "./utils/model-limits.js";

export interface ProviderModelManagerOptions {
    registry: ProviderRegistry;
    optionsByProvider?: Partial<Record<string, any>>;
    refreshIntervalMs?: number;
    defaultCooldownMs?: number;
}

export class ProviderModelManager {
    public readonly availability: ModelAvailabilityManager;
    private readonly registry: ProviderRegistry;
    private readonly optionsByProvider?: Partial<Record<string, any>>;

    constructor(options: ProviderModelManagerOptions) {
        this.registry = options.registry;
        this.optionsByProvider = options.optionsByProvider;
        this.availability = new ModelAvailabilityManager({
            defaultCooldownMs: options.defaultCooldownMs
        });

        if (options.refreshIntervalMs) {
            this.startAutoRefresh(options.refreshIntervalMs);
        }
    }

    public async refreshProvider(providerName: string): Promise<void> {
        const provider = this.registry.create(providerName, this.optionsByProvider?.[providerName]);
        const fallback = listModelCatalog(providerName).map((m) => m.model);
        await this.availability.refreshFromProvider(providerName, provider, fallback);
    }

    public async refreshAllProviders(): Promise<void> {
        for (const registration of this.registry.list()) {
            await this.refreshProvider(registration.name);
        }
    }

    public markModelFailure(provider: string, model: string, error: unknown, cooldownMs?: number): void {
        this.availability.markFailure(provider, model, error, cooldownMs);
    }

    public chooseModel(provider: string, preferredModel?: string): string | null {
        return this.availability.chooseModel(provider, preferredModel);
    }

    public listProviderModels(provider: string, includeCooldown: boolean = true) {
        return this.availability.listModels(provider, includeCooldown);
    }

    public startAutoRefresh(intervalMs: number = 60_000): void {
        this.availability.startAutoRefresh(async () => {
            await this.refreshAllProviders();
        }, intervalMs);
    }

    public stopAutoRefresh(): void {
        this.availability.stopAutoRefresh();
    }
}
