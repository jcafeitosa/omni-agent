import { AgentMessage, OAuthAccountSelectionStrategy, OAuthManager, ProviderResponse, ToolDefinition, ProviderRegistry } from "@omni-agent/core";
import { ProviderModelManager } from "./model-manager.js";
import { resolveModelLimits } from "./utils/model-limits.js";

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
    oauthManager?: OAuthManager;
    oauthProfileByProvider?: Partial<Record<string, string>>;
    oauthStrategy?: OAuthAccountSelectionStrategy;
}

export interface GenerateWithFallbackRequest {
    provider?: string;
    model?: string;
    defaultModel?: string;
    tools?: ToolDefinition[];
    providerOptions?: Partial<Record<string, any>>;
    providerPriority?: string[];
    maxAttempts?: number;
    allowProviderFallback?: boolean;
    preferOAuthModels?: boolean;
    refreshBeforeRoute?: boolean;
    cooldownMsOnFailure?: number;
    oauthAccountId?: string;
    oauthStrategy?: OAuthAccountSelectionStrategy;
    generateOptions?: any;
}

type EffortLevel = "low" | "medium" | "high" | "max";

export class ModelRouter {
    private readonly registry: ProviderRegistry;
    private readonly modelManager: ProviderModelManager;
    private readonly baseOptions?: Partial<Record<string, any>>;
    private readonly defaultCooldownMs: number;
    private readonly oauthManager?: OAuthManager;
    private readonly oauthProfileByProvider?: Partial<Record<string, string>>;
    private readonly oauthStrategy: OAuthAccountSelectionStrategy;

    constructor(options: ModelRouterOptions) {
        this.registry = options.registry;
        this.modelManager = options.modelManager;
        this.baseOptions = options.optionsByProvider;
        this.defaultCooldownMs = options.defaultCooldownMs ?? 60_000;
        this.oauthManager = options.oauthManager;
        this.oauthProfileByProvider = options.oauthProfileByProvider;
        this.oauthStrategy = options.oauthStrategy || "round_robin";
    }

    public async generateText(messages: AgentMessage[], request: GenerateWithFallbackRequest = {}): Promise<RouteResult> {
        const providers = this.resolveProviders(request);
        const maxAttempts = Math.max(1, request.maxAttempts ?? providers.length);
        const attempts: RouterAttempt[] = [];

        for (const providerName of providers.slice(0, maxAttempts)) {
            if (request.refreshBeforeRoute !== false) {
                try {
                    await this.modelManager.refreshProvider(providerName);
                } catch {
                    // Continue routing using configured or inferred model fallback.
                }
            }

            const model = this.selectModel(providerName, request);
            if (!model) {
                attempts.push({
                    provider: providerName,
                    model: "unknown",
                    error: "no model available for provider"
                });
                continue;
            }

            let resolved:
                | { options: any; lease?: { release(): void }; oauthProfileId?: string; oauthAccountId?: string }
                | undefined;
            try {
                resolved = await this.resolveProviderOptions(providerName, request, model);
                try {
                    const provider = this.registry.create(providerName, resolved.options);
                    const response = await provider.generateText(messages, request.tools, request.generateOptions);
                    this.modelManager.availability.clearCooldown(providerName, model);
                    attempts.push({ provider: providerName, model });
                    return {
                        provider: providerName,
                        model,
                        response,
                        attempts
                    };
                } finally {
                    resolved.lease?.release();
                }
            } catch (error) {
                const rateLimit = extractRateLimitInfo(error);
                if (
                    rateLimit.limited &&
                    this.oauthManager
                ) {
                    const profileId =
                        resolved?.oauthProfileId ||
                        this.oauthProfileByProvider?.[providerName] ||
                        defaultOAuthProfileId(providerName);
                    const accountId = resolved?.oauthAccountId || request.oauthAccountId;
                    if (accountId && profileId) {
                        try {
                            await this.oauthManager.reportRateLimit(profileId, accountId, {
                                retryAfterMs: rateLimit.retryAfterMs,
                                remaining: rateLimit.remaining,
                                limit: rateLimit.limit,
                                resetAt: rateLimit.resetAt
                            });
                        } catch {
                            // ignore telemetry/reporting failures
                        }
                    }
                }
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

    private async resolveProviderOptions(
        provider: string,
        request: GenerateWithFallbackRequest,
        model?: string
    ): Promise<{ options: any; lease?: { release(): void }; oauthProfileId?: string; oauthAccountId?: string }> {
        const merged: Record<string, any> = {
            ...this.baseOptions?.[provider],
            ...request.providerOptions?.[provider]
        };
        if (model) {
            merged.model = model;
        }

        const oauthProfileId = merged.oauthProfileId || this.oauthProfileByProvider?.[provider] || defaultOAuthProfileId(provider);
        if (!this.oauthManager || !oauthProfileId) {
            return { options: merged };
        }
        if (merged.apiKey || merged.token || merged.accessToken) {
            return { options: merged };
        }

        const lease = await this.oauthManager.acquireAccessToken(oauthProfileId, {
            accountId: request.oauthAccountId,
            strategy: request.oauthStrategy || this.oauthStrategy
        });
        if (!lease) {
            return { options: merged };
        }

        const headers = this.oauthManager.buildAuthHeaders(oauthProfileId, lease.accessToken);
        return {
            options: {
                ...merged,
                apiKey: lease.accessToken,
                token: lease.accessToken,
                accessToken: lease.accessToken,
                defaultHeaders: {
                    ...(merged.defaultHeaders || {}),
                    ...headers
                },
                oauthProfileId
            },
            lease,
            oauthProfileId,
            oauthAccountId: lease.accountId
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

    private selectModel(provider: string, request: GenerateWithFallbackRequest): string | undefined {
        const preferredModel = this.preferredModelForProvider(provider, request);
        if (preferredModel && !this.modelManager.availability.isOnCooldown(provider, preferredModel)) {
            return preferredModel;
        }

        if (request.defaultModel && !this.modelManager.availability.isOnCooldown(provider, request.defaultModel)) {
            return request.defaultModel;
        }

        const active = this.modelManager.listProviderModels(provider, false).map((m) => m.model);
        const fallbackConfigured = this.inferConfiguredModel(provider, request);
        const candidates = dedupe([...active, ...(fallbackConfigured ? [fallbackConfigured] : [])]);
        if (candidates.length === 0) return undefined;

        const effortAware = this.pickEffortAwareModel(provider, candidates, request);
        if (effortAware) {
            return effortAware;
        }

        const preferOAuth = request.preferOAuthModels !== false;
        const oauthDefaultModel = preferOAuth && this.isOAuthPreferredProvider(provider) ? fallbackConfigured : undefined;
        if (oauthDefaultModel && candidates.includes(oauthDefaultModel)) {
            return oauthDefaultModel;
        }

        if (preferOAuth && this.isOAuthPreferredProvider(provider)) {
            return this.pickLatestModel(candidates);
        }

        return this.pickLatestCheapestModel(provider, candidates);
    }

    private inferConfiguredModel(provider: string, request: GenerateWithFallbackRequest): string | undefined {
        try {
            const instance = this.registry.create(provider, this.resolveBaseProviderOptions(provider, request));
            
            return instance.getModelLimits().model;
        } catch {
            return undefined;
        }
    }

    private resolveBaseProviderOptions(provider: string, request: GenerateWithFallbackRequest): any {
        return {
            ...this.baseOptions?.[provider],
            ...request.providerOptions?.[provider]
        };
    }

    private resolveProviders(request: GenerateWithFallbackRequest): string[] {
        const chosen: string[] = [];
        const allProviders = this.registry.list().map((r) => r.name);
        const sortedAllProviders = this.sortProvidersByPolicy(allProviders, request);

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

        if (chosen.length === 0 && sortedAllProviders.length > 0) {
            chosen.push(...sortedAllProviders);
        } else if (request.allowProviderFallback !== false) {
            chosen.push(...sortedAllProviders);
        }

        return dedupe(chosen);
    }

    private sortProvidersByPolicy(providers: string[], request: GenerateWithFallbackRequest): string[] {
        return [...providers].sort((a, b) => {
            const oauthA = this.isOAuthPreferredProvider(a) ? 1 : 0;
            const oauthB = this.isOAuthPreferredProvider(b) ? 1 : 0;
            if (oauthA !== oauthB) return oauthB - oauthA;

            const rankA = this.bestProviderRank(a, request);
            const rankB = this.bestProviderRank(b, request);
            return rankA - rankB;
        });
    }

    private bestProviderRank(provider: string, request: GenerateWithFallbackRequest): number {
        const candidates = this.modelManager.listProviderModels(provider, false).map((m) => m.model);
        const fallbackConfigured = this.inferConfiguredModel(provider, request);
        const model = this.pickLatestCheapestModel(provider, dedupe([...candidates, ...(fallbackConfigured ? [fallbackConfigured] : [])]));
        if (!model) return Number.MAX_SAFE_INTEGER;

        const limits = resolveModelLimits(provider, model);
        const costRank = costClassRank(limits.classification?.costClass || "medium");
        const recencyRank = -extractRecencyNumber(model);
        return costRank * 10_000 + recencyRank;
    }

    private pickLatestCheapestModel(provider: string, candidates: string[]): string | undefined {
        if (candidates.length === 0) return undefined;
        return [...candidates].sort((a, b) => {
            const limitsA = resolveModelLimits(provider, a);
            const limitsB = resolveModelLimits(provider, b);
            const costDelta =
                costClassRank(limitsA.classification?.costClass || "medium") -
                costClassRank(limitsB.classification?.costClass || "medium");
            if (costDelta !== 0) return costDelta;
            return extractRecencyNumber(b) - extractRecencyNumber(a);
        })[0];
    }

    private pickLatestModel(candidates: string[]): string | undefined {
        if (candidates.length === 0) return undefined;
        return [...candidates].sort((a, b) => extractRecencyNumber(b) - extractRecencyNumber(a))[0];
    }

    private pickEffortAwareModel(
        provider: string,
        candidates: string[],
        request: GenerateWithFallbackRequest
    ): string | undefined {
        const preference = parseEffortPreference(request.generateOptions);
        if (!preference.level && !preference.adaptiveThinking) {
            return undefined;
        }

        const matching = candidates.filter((model) => {
            const classification = resolveModelLimits(provider, model).classification;
            if (!classification) return false;

            if (preference.level) {
                if (!classification.supportsEffort) return false;
                const supported = classification.supportedEffortLevels || [];
                if (!supported.includes(preference.level)) return false;
            }

            if (preference.adaptiveThinking && !classification.supportsAdaptiveThinking) {
                return false;
            }

            return true;
        });

        if (matching.length === 0) return undefined;

        const preferOAuth = request.preferOAuthModels !== false;
        if (preferOAuth && this.isOAuthPreferredProvider(provider)) {
            return this.pickLatestModel(matching);
        }
        return this.pickLatestCheapestModel(provider, matching);
    }

    private isOAuthPreferredProvider(provider: string): boolean {
        return OAUTH_PREFERRED_PROVIDERS.has(provider);
    }
}

function dedupe(items: string[]): string[] {
    return Array.from(new Set(items));
}

const OAUTH_PREFERRED_PROVIDERS = new Set([
    "anthropic",
    "gemini",
    "openai"
]);

function costClassRank(costClass: "low" | "medium" | "high"): number {
    if (costClass === "low") return 0;
    if (costClass === "medium") return 1;
    return 2;
}

function extractRecencyNumber(model: string): number {
    const m = model.match(/(20\d{2})(\d{2})(\d{2})/);
    if (m) return Number(`${m[1]}${m[2]}${m[3]}`);
    const m2 = model.match(/(\d+(?:\.\d+)?)/g);
    if (m2 && m2.length > 0) {
        return Number(m2.join("").replace(/\D/g, "").slice(0, 12)) || 0;
    }
    return 0;
}

function parseEffortPreference(generateOptions: any): { level?: EffortLevel; adaptiveThinking?: boolean } {
    if (!generateOptions || typeof generateOptions !== "object") {
        return {};
    }

    const effortRaw = generateOptions.effort ?? generateOptions.reasoningEffort ?? generateOptions["reasoning_effort"];
    const adaptiveRaw =
        generateOptions.adaptiveThinking ?? generateOptions["adaptive_thinking"] ?? generateOptions.thinking?.adaptive;

    const level = normalizeEffortLevel(effortRaw);
    const adaptiveThinking = adaptiveRaw === true;

    return { level, adaptiveThinking };
}

function normalizeEffortLevel(value: unknown): EffortLevel | undefined {
    if (typeof value === "string") {
        const v = value.trim().toLowerCase();
        if (v === "low" || v === "medium" || v === "high" || v === "max") {
            return v;
        }
        return undefined;
    }
    if (value && typeof value === "object") {
        const level = (value as Record<string, unknown>).level;
        if (typeof level === "string") {
            return normalizeEffortLevel(level);
        }
    }
    return undefined;
}

function defaultOAuthProfileId(provider: string): string | undefined {
    if (provider === "anthropic") return "claude-code";
    if (provider === "gemini") return "gemini-cli";
    if (provider === "cursor") return "cursor";
    if (provider === "openai" || provider === "codex") return "codex";
    return undefined;
}

function extractRateLimitInfo(error: unknown): {
    limited: boolean;
    retryAfterMs?: number;
    remaining?: number;
    limit?: number;
    resetAt?: number;
} {
    const err = error as any;
    const status = Number(err?.status || err?.statusCode || err?.response?.status || 0);
    const message = String(err?.message || err || "").toLowerCase();
    const limitedByStatus = status === 429;
    const limitedByMessage = /rate[\s_-]*limit|too many requests|quota exceeded/.test(message);
    const limited = limitedByStatus || limitedByMessage;

    const headers = err?.headers || err?.response?.headers || {};
    const retryAfterRaw =
        headers["retry-after"] ||
        headers["Retry-After"] ||
        err?.retryAfter ||
        err?.retryAfterSeconds;
    const remainingRaw = headers["x-ratelimit-remaining"] || headers["X-RateLimit-Remaining"] || err?.rateLimitRemaining;
    const limitRaw = headers["x-ratelimit-limit"] || headers["X-RateLimit-Limit"] || err?.rateLimitLimit;
    const resetRaw = headers["x-ratelimit-reset"] || headers["X-RateLimit-Reset"] || err?.rateLimitReset;

    const retryAfterMs =
        typeof retryAfterRaw === "number"
            ? retryAfterRaw > 1000 ? retryAfterRaw : retryAfterRaw * 1000
            : typeof retryAfterRaw === "string"
                ? Number(retryAfterRaw) * 1000 || undefined
                : undefined;
    const remaining = toOptionalNumber(remainingRaw);
    const limit = toOptionalNumber(limitRaw);
    const resetAt =
        typeof resetRaw === "number"
            ? resetRaw > 10_000_000_000 ? resetRaw : resetRaw * 1000
            : typeof resetRaw === "string"
                ? (() => {
                    const n = Number(resetRaw);
                    if (!Number.isFinite(n)) return undefined;
                    return n > 10_000_000_000 ? n : n * 1000;
                })()
                : undefined;

    return { limited, retryAfterMs, remaining, limit, resetAt };
}

function toOptionalNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
    }
    return undefined;
}
