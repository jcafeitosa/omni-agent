export interface ProviderCompatProfile {
    requiresToolResultName?: boolean;
    requiresAssistantAfterToolResult?: boolean;
    requiresThinkingAsText?: boolean;
    requiresMistralToolIds?: boolean;
    maxTokensField?: "max_tokens" | "max_completion_tokens";
    supportsUsageInStreaming?: boolean;
}

function isOpenRouter(baseURL?: string): boolean {
    return Boolean(baseURL && /openrouter\.ai/i.test(baseURL));
}

function isVercelGateway(baseURL?: string): boolean {
    return Boolean(baseURL && /ai-gateway\.vercel\.sh|gateway\.ai\.vercel\.com/i.test(baseURL));
}

export function resolveProviderCompatProfile(provider: string, baseURL?: string): ProviderCompatProfile {
    const normalized = provider.toLowerCase();

    if (normalized === "mistral") {
        return {
            requiresMistralToolIds: true,
            maxTokensField: "max_tokens",
            supportsUsageInStreaming: true
        };
    }

    if (normalized === "deepseek") {
        return {
            maxTokensField: "max_tokens",
            supportsUsageInStreaming: false
        };
    }

    if (normalized === "openrouter" || isOpenRouter(baseURL)) {
        return {
            supportsUsageInStreaming: true,
            maxTokensField: "max_completion_tokens"
        };
    }

    if (isVercelGateway(baseURL)) {
        return {
            supportsUsageInStreaming: true,
            maxTokensField: "max_completion_tokens"
        };
    }

    return {
        supportsUsageInStreaming: true,
        maxTokensField: "max_completion_tokens"
    };
}

export function normalizeMistralToolCallId(id: string): string {
    const stripped = String(id || "").replace(/[^a-zA-Z0-9]/g, "");
    if (stripped.length === 9) return stripped;
    if (stripped.length > 9) return stripped.slice(0, 9);
    return `${stripped}ABCDEFGHI`.slice(0, 9);
}
