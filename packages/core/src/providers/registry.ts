import { Provider, ProviderModelLimits } from "../index.js";

export type ProviderFeature =
    | "chat"
    | "tool-calling"
    | "streaming"
    | "embeddings"
    | "multimodal-input"
    | "batch";

export interface ProviderCapabilities {
    features: ProviderFeature[];
    notes?: string;
}

export interface ProviderRegistration<TOptions = any> {
    name: string;
    create: (options?: TOptions) => Provider;
    modelPatterns?: RegExp[];
    capabilities?: ProviderCapabilities;
}

export class ProviderRegistry {
    private registrations = new Map<string, ProviderRegistration<any>>();

    register<TOptions>(registration: ProviderRegistration<TOptions>): void {
        this.registrations.set(registration.name, registration as ProviderRegistration<any>);
    }

    has(name: string): boolean {
        return this.registrations.has(name);
    }

    list(): ProviderRegistration<any>[] {
        return Array.from(this.registrations.values());
    }

    create<TOptions = any>(name: string, options?: TOptions): Provider {
        const registration = this.registrations.get(name);
        if (!registration) {
            throw new Error(`Provider not registered: ${name}`);
        }
        return registration.create(options);
    }

    resolveProviderNameForModel(model: string): string | null {
        for (const registration of this.registrations.values()) {
            if (!registration.modelPatterns || registration.modelPatterns.length === 0) {
                continue;
            }
            if (registration.modelPatterns.some((pattern) => pattern.test(model))) {
                return registration.name;
            }
        }
        return null;
    }

    createForModel<TOptions = any>(model: string, optionsByProvider?: Partial<Record<string, TOptions>>): Provider {
        const providerName = this.resolveProviderNameForModel(model);
        if (!providerName) {
            throw new Error(`No provider registered for model: ${model}`);
        }
        const providerOptions = optionsByProvider?.[providerName];
        return this.create(providerName, providerOptions);
    }

    getCapabilities(name: string): ProviderCapabilities | null {
        return this.registrations.get(name)?.capabilities || null;
    }

    getModelLimits(name: string, model: string): ProviderModelLimits {
        const provider = this.create(name);
        return provider.getModelLimits(model);
    }
}

