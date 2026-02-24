import { ProviderModelLimits } from "@omni-agent/core";

interface CatalogEntry {
    provider: string;
    model: string;
    pattern: RegExp;
    contextWindowTokens: number;
    maxOutputTokens: number | null;
    classification: NonNullable<ProviderModelLimits["classification"]>;
    notes?: string;
}

const LIMITS_CATALOG: CatalogEntry[] = [
    {
        provider: "openai",
        model: "gpt-4o",
        pattern: /^gpt-4o(-mini)?$/i,
        contextWindowTokens: 128000,
        maxOutputTokens: 16384,
        classification: {
            family: "gpt-4o",
            tier: "flagship",
            latencyClass: "medium",
            costClass: "high",
            reasoningClass: "advanced",
            modalities: ["text", "image", "code"],
            supportsToolCalling: true,
            supportsEmbeddings: false
        },
        notes: "Estimated defaults; verify against provider docs for exact deployment limits."
    },
    {
        provider: "openai",
        model: "gpt-4o-mini",
        pattern: /^gpt-4o-mini$/i,
        contextWindowTokens: 128000,
        maxOutputTokens: 16384,
        classification: {
            family: "gpt-4o",
            tier: "fast",
            latencyClass: "low",
            costClass: "low",
            reasoningClass: "baseline",
            modalities: ["text", "image", "code"],
            supportsToolCalling: true,
            supportsEmbeddings: false
        },
        notes: "Estimated defaults; verify against provider docs for exact deployment limits."
    },
    {
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        pattern: /^claude-3-5-sonnet/i,
        contextWindowTokens: 200000,
        maxOutputTokens: 8192,
        classification: {
            family: "claude-3-5",
            tier: "flagship",
            latencyClass: "medium",
            costClass: "high",
            reasoningClass: "advanced",
            modalities: ["text", "image", "code"],
            supportsToolCalling: true,
            supportsEmbeddings: false
        },
        notes: "Estimated defaults; verify against provider docs for exact deployment limits."
    },
    {
        provider: "gemini",
        model: "gemini-2.5-flash",
        pattern: /^gemini-2\.5-flash/i,
        contextWindowTokens: 1048576,
        maxOutputTokens: 65536,
        classification: {
            family: "gemini-2.5",
            tier: "fast",
            latencyClass: "low",
            costClass: "medium",
            reasoningClass: "advanced",
            modalities: ["text", "image", "code"],
            supportsToolCalling: true,
            supportsEmbeddings: true
        },
        notes: "Estimated defaults; verify against provider docs for exact deployment limits."
    },
    {
        provider: "amazon-bedrock",
        model: "anthropic.claude-3-5-sonnet",
        pattern: /anthropic\.claude-3-5-sonnet/i,
        contextWindowTokens: 200000,
        maxOutputTokens: 8192,
        classification: {
            family: "bedrock-anthropic",
            tier: "flagship",
            latencyClass: "medium",
            costClass: "high",
            reasoningClass: "advanced",
            modalities: ["text", "image", "code"],
            supportsToolCalling: true,
            supportsEmbeddings: true
        },
        notes: "Estimated defaults; verify against provider docs for exact deployment limits."
    },
    {
        provider: "openai",
        model: "text-embedding-3-small",
        pattern: /^text-embedding-3-small$/i,
        contextWindowTokens: 8192,
        maxOutputTokens: null,
        classification: {
            family: "embedding",
            tier: "specialized",
            latencyClass: "low",
            costClass: "low",
            reasoningClass: "baseline",
            modalities: ["text", "code"],
            supportsToolCalling: false,
            supportsEmbeddings: true
        },
        notes: "Embedding model entry."
    },
    {
        provider: "gemini",
        model: "text-embedding-004",
        pattern: /^text-embedding-004$/i,
        contextWindowTokens: 8192,
        maxOutputTokens: null,
        classification: {
            family: "embedding",
            tier: "specialized",
            latencyClass: "low",
            costClass: "low",
            reasoningClass: "baseline",
            modalities: ["text", "code"],
            supportsToolCalling: false,
            supportsEmbeddings: true
        },
        notes: "Embedding model entry."
    },
    {
        provider: "amazon-bedrock",
        model: "amazon.titan-embed-text-v2:0",
        pattern: /^amazon\.titan-embed-text-v2:0$/i,
        contextWindowTokens: 8192,
        maxOutputTokens: null,
        classification: {
            family: "embedding",
            tier: "specialized",
            latencyClass: "low",
            costClass: "low",
            reasoningClass: "baseline",
            modalities: ["text", "code"],
            supportsToolCalling: false,
            supportsEmbeddings: true
        },
        notes: "Estimated defaults; verify against provider docs for exact deployment limits."
    }
];

const OPENAI_COMPAT_PROVIDERS = new Set([
    "openrouter",
    "groq",
    "xai",
    "mistral",
    "deepseek",
    "cerebras",
    "ollama",
    "azure-openai"
]);

function normalizeProvider(provider: string): string {
    return OPENAI_COMPAT_PROVIDERS.has(provider) ? "openai" : provider;
}

export function resolveModelLimits(
    provider: string,
    model: string,
    configuredMaxOutputTokens?: number | null
): ProviderModelLimits {
    const normalizedProvider = normalizeProvider(provider);
    const entry = LIMITS_CATALOG.find((item) => item.provider === normalizedProvider && item.pattern.test(model));

    if (entry) {
        const maxOutputTokens = configuredMaxOutputTokens ?? entry.maxOutputTokens;
        return {
            provider,
            model,
            contextWindowTokens: entry.contextWindowTokens,
            maxOutputTokens,
            maxInputTokens: maxOutputTokens ? Math.max(entry.contextWindowTokens - maxOutputTokens, 0) : entry.contextWindowTokens,
            source: configuredMaxOutputTokens ? "configured" : "catalog",
            classification: entry.classification,
            notes: entry.notes
        };
    }

    return {
        provider,
        model,
        contextWindowTokens: null,
        maxOutputTokens: configuredMaxOutputTokens ?? null,
        maxInputTokens: null,
        source: configuredMaxOutputTokens ? "configured" : "unknown",
        classification: {
            family: "unknown",
            tier: "balanced",
            latencyClass: "medium",
            costClass: "medium",
            reasoningClass: "baseline",
            modalities: ["text", "code"],
            supportsToolCalling: true,
            supportsEmbeddings: "provider-dependent"
        },
        notes: "No catalog entry found for this provider/model. Configure limits explicitly when required."
    };
}

export function listModelCatalog(provider?: string): Array<{
    provider: string;
    model: string;
    contextWindowTokens: number;
    maxOutputTokens: number | null;
    classification: NonNullable<ProviderModelLimits["classification"]>;
    notes?: string;
}> {
    const normalizedProvider = provider ? normalizeProvider(provider) : null;
    return LIMITS_CATALOG
        .filter((entry) => !normalizedProvider || entry.provider === normalizedProvider)
        .map((entry) => ({
            provider: entry.provider,
            model: entry.model,
            contextWindowTokens: entry.contextWindowTokens,
            maxOutputTokens: entry.maxOutputTokens,
            classification: entry.classification,
            notes: entry.notes
        }));
}
