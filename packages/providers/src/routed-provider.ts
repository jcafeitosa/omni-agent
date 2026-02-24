import { AgentMessage, Provider, ProviderModelLimits, ProviderResponse, ToolDefinition } from "@omni-agent/core";
import { GenerateWithFallbackRequest, ModelRouter, RouterAttempt } from "./routing.js";

export interface RoutedProviderOptions {
    baseProvider: Provider;
    router: ModelRouter;
    requestDefaults?: Omit<GenerateWithFallbackRequest, "tools" | "generateOptions">;
    name?: string;
}

export interface LastRouteInfo {
    provider: string;
    model: string;
    attempts: RouterAttempt[];
}

export class RoutedProvider implements Provider {
    public readonly name: string;
    private readonly baseProvider: Provider;
    private readonly router: ModelRouter;
    private readonly requestDefaults?: Omit<GenerateWithFallbackRequest, "tools" | "generateOptions">;
    private lastRouteInfo?: LastRouteInfo;

    constructor(options: RoutedProviderOptions) {
        this.baseProvider = options.baseProvider;
        this.router = options.router;
        this.requestDefaults = options.requestDefaults;
        this.name = options.name || `routed:${this.baseProvider.name}`;
    }

    public async generateText(
        messages: AgentMessage[],
        tools?: ToolDefinition[],
        options?: any
    ): Promise<ProviderResponse> {
        const result = await this.router.generateText(messages, {
            ...this.requestDefaults,
            tools,
            generateOptions: options
        });
        this.lastRouteInfo = {
            provider: result.provider,
            model: result.model,
            attempts: result.attempts
        };
        return result.response;
    }

    public async embedText(text: string): Promise<number[]> {
        return this.baseProvider.embedText(text);
    }

    public async embedBatch(texts: string[]): Promise<number[][]> {
        return this.baseProvider.embedBatch(texts);
    }

    public getModelLimits(model?: string): ProviderModelLimits {
        return this.baseProvider.getModelLimits(model);
    }

    public getOAuthProfileId(): string | undefined {
        return this.baseProvider.getOAuthProfileId?.();
    }

    public async listAvailableModels(): Promise<string[]> {
        if (this.baseProvider.listAvailableModels) {
            return this.baseProvider.listAvailableModels();
        }
        return [this.baseProvider.getModelLimits().model];
    }

    public getLastRoute(): LastRouteInfo | undefined {
        return this.lastRouteInfo;
    }
}

