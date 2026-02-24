import type { CostRateRule } from "./cost-analytics.js";

export const DEFAULT_RATE_CARD_VERSION = "2026-02-24";

export const DEFAULT_RATE_CARD_RULES: CostRateRule[] = [
    { provider: "openai", model: "*", rate: { inputUsdPerMillion: 3, outputUsdPerMillion: 12, thinkingUsdPerMillion: 12 } },
    { provider: "anthropic", model: "*", rate: { inputUsdPerMillion: 3, outputUsdPerMillion: 15, thinkingUsdPerMillion: 15 } },
    { provider: "gemini", model: "*", rate: { inputUsdPerMillion: 1.25, outputUsdPerMillion: 5, thinkingUsdPerMillion: 5 } },
    { provider: "bedrock", model: "*", rate: { inputUsdPerMillion: 3, outputUsdPerMillion: 15, thinkingUsdPerMillion: 15 } },
    { provider: "azure-openai", model: "*", rate: { inputUsdPerMillion: 3, outputUsdPerMillion: 12, thinkingUsdPerMillion: 12 } },
    { provider: "vertex", model: "*", rate: { inputUsdPerMillion: 1.25, outputUsdPerMillion: 5, thinkingUsdPerMillion: 5 } },
    { provider: "ollama", model: "*", rate: { inputUsdPerMillion: 0, outputUsdPerMillion: 0, thinkingUsdPerMillion: 0 } },
    { provider: "llama-cpp", model: "*", rate: { inputUsdPerMillion: 0, outputUsdPerMillion: 0, thinkingUsdPerMillion: 0 } }
];

