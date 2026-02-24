import type { EventLogEntry } from "../state/event-log-store.js";
import { DEFAULT_RATE_CARD_RULES, DEFAULT_RATE_CARD_VERSION } from "./default-rate-card.js";

export interface UsageLike {
    inputTokens?: number;
    outputTokens?: number;
    thinkingTokens?: number;
}

export interface CostRate {
    inputUsdPerMillion: number;
    outputUsdPerMillion: number;
    thinkingUsdPerMillion?: number;
}

export interface CostRateRule {
    provider: string;
    model?: string;
    rate: CostRate;
}

export interface TurnCostRecord {
    ts: number;
    provider?: string;
    model?: string;
    status?: string;
    usage: Required<UsageLike>;
    estimatedCostUsd: number;
    pricingSource: "rule" | "default";
}

export interface CostSummary {
    rateCardVersion: string;
    turns: TurnCostRecord[];
    totalTurns: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalThinkingTokens: number;
    totalEstimatedCostUsd: number;
    byProvider: Record<string, number>;
    byModel: Record<string, number>;
}

export interface CostAnalyticsOptions {
    defaultRate?: CostRate;
    rules?: CostRateRule[];
    rateCardVersion?: string;
    includeFailedTurns?: boolean;
}

const DEFAULT_RATE: CostRate = {
    inputUsdPerMillion: 3,
    outputUsdPerMillion: 15,
    thinkingUsdPerMillion: 15
};

function normalizeUsage(raw: UsageLike | undefined): Required<UsageLike> {
    return {
        inputTokens: Number(raw?.inputTokens || 0),
        outputTokens: Number(raw?.outputTokens || 0),
        thinkingTokens: Number(raw?.thinkingTokens || 0)
    };
}

function modelMatches(ruleModel: string | undefined, model: string | undefined): boolean {
    if (!ruleModel || ruleModel === "*") return true;
    if (!model) return false;
    return ruleModel === model;
}

function resolveRate(
    provider: string | undefined,
    model: string | undefined,
    options: CostAnalyticsOptions
): { rate: CostRate; source: "rule" | "default" } {
    const rules = options.rules || DEFAULT_RATE_CARD_RULES;
    if (provider) {
        const exact = rules.find((rule) => rule.provider === provider && rule.model === model);
        if (exact) return { rate: exact.rate, source: "rule" };

        const wildcardModel = rules.find((rule) => rule.provider === provider && rule.model === "*");
        if (wildcardModel) return { rate: wildcardModel.rate, source: "rule" };

        const providerOnly = rules.find((rule) => rule.provider === provider && !rule.model);
        if (providerOnly) return { rate: providerOnly.rate, source: "rule" };
    }
    return { rate: options.defaultRate || DEFAULT_RATE, source: "default" };
}

export function estimateUsageCostUsd(usage: UsageLike, rate: CostRate = DEFAULT_RATE): number {
    const normalized = normalizeUsage(usage);
    return (
        (normalized.inputTokens / 1_000_000) * rate.inputUsdPerMillion +
        (normalized.outputTokens / 1_000_000) * rate.outputUsdPerMillion +
        (normalized.thinkingTokens / 1_000_000) * (rate.thinkingUsdPerMillion ?? rate.outputUsdPerMillion)
    );
}

export function summarizeTurnCosts(
    events: EventLogEntry[],
    options: CostAnalyticsOptions = {}
): CostSummary {
    const includeFailedTurns = options.includeFailedTurns === true;
    const turns: TurnCostRecord[] = [];
    const byProvider: Record<string, number> = {};
    const byModel: Record<string, number> = {};
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalThinkingTokens = 0;
    let totalEstimatedCostUsd = 0;

    for (const event of events) {
        if (event.type !== "turn_completed") continue;
        const payload = event.payload || {};
        if (!includeFailedTurns && payload.status && payload.status !== "success") continue;

        const usage = normalizeUsage(payload.usage);
        const provider = typeof payload.provider === "string" ? payload.provider : undefined;
        const model = typeof payload.model === "string" ? payload.model : undefined;
        const { rate, source } = resolveRate(provider, model, options);
        const estimatedCostUsd = estimateUsageCostUsd(usage, rate);

        const record: TurnCostRecord = {
            ts: event.ts,
            provider,
            model,
            status: typeof payload.status === "string" ? payload.status : undefined,
            usage,
            estimatedCostUsd,
            pricingSource: source
        };

        turns.push(record);
        totalInputTokens += usage.inputTokens;
        totalOutputTokens += usage.outputTokens;
        totalThinkingTokens += usage.thinkingTokens;
        totalEstimatedCostUsd += estimatedCostUsd;

        if (provider) {
            byProvider[provider] = (byProvider[provider] || 0) + estimatedCostUsd;
        }
        if (model) {
            byModel[model] = (byModel[model] || 0) + estimatedCostUsd;
        }
    }

    return {
        rateCardVersion: options.rateCardVersion || DEFAULT_RATE_CARD_VERSION,
        turns,
        totalTurns: turns.length,
        totalInputTokens,
        totalOutputTokens,
        totalThinkingTokens,
        totalEstimatedCostUsd,
        byProvider,
        byModel
    };
}
