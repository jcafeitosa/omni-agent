import { AgentMessage, ProviderResponse, ToolDefinition, ProviderRegistry } from "@omni-agent/core";
import { ProviderModelManager } from "./model-manager.js";

export interface RouterAttempt {
    provider: string;
    model: string;
    error?: string;
}

export interface RouteResult {
    provider: string;
    model: string;
    response: ProviderResponse;
    attempts: RouterAttempt[];
}

export interface ModelRouterOptions {
    registry: ProviderRegistry;
    modelManager: ProviderModelManager;
    optionsByProvider?: Partial<Record<string, any>>;
    defaultCooldownMs?: number;
}

export interface GenerateWithFallbackRequest {
    provider?: string;
    model?: string;
    tools?: ToolDefinition[];
    providerOptions?: Partial<Record<string, any>>;
    providerPriority?: string[];
    maxAttempts?: number;
    allowProviderFallback?: boolean;
    refreshBeforeRoute?: boolean;
    cooldownMsOnFailure?: number;
    generateOptions?: any;
}

export class ModelRouter {
    private readonly registry: ProviderRegistry;
    private readonly modelManager: ProviderModelManager;
    private readonly baseOptions?: Partial<Record<string, any>>;
    private readonly defaultCooldownMs: number;

    constructor(options: ModelRouterOptions) {
        this.registry = options.registry;
        this.modelManager = options.modelManager;
        this.baseOptions = options.optionsByProvider;
        this.defaultCooldownMs = options.defaultCooldownMs ?? 60_000;
    }

    public async generateText(messages: AgentMessage[], request: GenerateWithFallbackRequest = {}): Promise<RouteResult> {
        const providers = this.resolveProviders(request);
        const maxAttempts = Math.max(1, request.maxAttempts ?? providers.length);
        const attempts: RouterAttempt[] = [];

        for (const providerName of providers.slice(0, maxAttempts)) {
            if (request.refreshBeforeRoute !== false) {
                await this.modelManager.refreshProvider(providerName);
            }

            const preferredModel = this.preferredModelForProvider(providerName, request);
            const model = this.modelManager.chooseModel(providerName, preferredModel) || preferredModel;
            if (!model) {
                attempts.push({
                    provider: providerName,
                    model: "unknown",
                    error: "no model available for provider"
                });
                continue;
            }

            try {
                const provider = this.registry.create(providerName, this.resolveProviderOptions(providerName, model, request));
                const response = await provider.generateText(messages, request.tools, request.generateOptions);
                this.modelManager.availability.clearCooldown(providerName, model);
                attempts.push({ provider: providerName, model });
                return {
                    provider: providerName,
                    model,
                    response,
                    attempts
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.modelManager.markModelFailure(
                    providerName,
                    model,
                    error,
                    request.cooldownMsOnFailure ?? this.defaultCooldownMs
                );
                attempts.push({ provider: providerName, model, error: message });
            }
        }

        const summary = attempts.map((a) => `${a.provider}/${a.model}: ${a.error || "unknown error"}`).join("; ");
        throw new Error(`All routing attempts failed. ${summary}`);
    }

    private resolveProviderOptions(provider: string, model: string, request: GenerateWithFallbackRequest): any {
        return {
            ...this.baseOptions?.[provider],
            ...request.providerOptions?.[provider],
            model
        };
    }

    private preferredModelForProvider(provider: string, request: GenerateWithFallbackRequest): string | undefined {
        if (!request.model) return undefined;
        const inferredProvider = this.registry.resolveProviderNameForModel(request.model);
        if (!inferredProvider || inferredProvider === provider) {
            return request.model;
        }
        return undefined;
    }

    private resolveProviders(request: GenerateWithFallbackRequest): string[] {
        const chosen: string[] = [];
        const allProviders = this.registry.list().map((r) => r.name);

        if (request.provider && this.registry.has(request.provider)) {
            chosen.push(request.provider);
        } else if (request.model) {
            const inferred = this.registry.resolveProviderNameForModel(request.model);
            if (inferred) {
                chosen.push(inferred);
            }
        }

        if (request.providerPriority?.length) {
            for (const name of request.providerPriority) {
                if (this.registry.has(name)) {
                    chosen.push(name);
                }
            }
        }

        if (chosen.length === 0 && allProviders.length > 0) {
            chosen.push(...allProviders);
        } else if (request.allowProviderFallback !== false) {
            chosen.push(...allProviders);
        }

        return dedupe(chosen);
    }
}

function dedupe(items: string[]): string[] {
    return Array.from(new Set(items));
}

