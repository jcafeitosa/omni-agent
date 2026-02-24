import { OAuthManager, OAuthProviderProfile, ProviderRegistry } from "@omni-agent/core";

export interface DynamicProviderRegistration<TOptions = any> {
    name: string;
    create: (options?: TOptions) => any;
    modelPatterns?: RegExp[];
    capabilities?: { features: Array<"chat" | "tool-calling" | "streaming" | "embeddings" | "multimodal-input" | "batch">; notes?: string };
    oauthProfile?: OAuthProviderProfile;
    sourceId?: string;
}

export class DynamicProviderRuntime {
    constructor(
        private readonly registry: ProviderRegistry,
        private readonly oauthManager?: OAuthManager
    ) {}

    public register<TOptions = any>(registration: DynamicProviderRegistration<TOptions>): void {
        (this.registry as any).register({
            name: registration.name,
            create: registration.create,
            modelPatterns: registration.modelPatterns,
            capabilities: registration.capabilities,
            sourceId: registration.sourceId
        });

        if (registration.oauthProfile && this.oauthManager) {
            this.oauthManager.registerProfile(registration.oauthProfile);
        }
    }

    public unregister(name: string): boolean {
        const registry = this.registry as any;
        if (typeof registry.unregister === "function") {
            return registry.unregister(name);
        }
        return false;
    }

    public unregisterBySource(sourceId: string): number {
        const registry = this.registry as any;
        if (typeof registry.unregisterBySource === "function") {
            return registry.unregisterBySource(sourceId);
        }
        return 0;
    }
}
