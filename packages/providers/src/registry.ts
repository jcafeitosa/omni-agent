import { ProviderRegistry } from "@omni-agent/core";
import { AnthropicProvider, AnthropicProviderOptions } from "./anthropic.js";
import { OpenAIProvider, OpenAIProviderOptions } from "./openai.js";
import { GeminiProvider, GeminiProviderOptions } from "./gemini.js";
import { BedrockProvider, BedrockProviderOptions } from "./bedrock.js";
import { AzureOpenAIProvider, AzureOpenAIProviderOptions } from "./azure-openai.js";
import { VertexProvider, VertexProviderOptions } from "./vertex.js";
import { LlamaCppProvider, LlamaCppProviderOptions } from "./llama-cpp.js";
import {
    CerebrasProvider,
    DeepSeekProvider,
    GroqProvider,
    MistralProvider,
    OllamaProviderOptions,
    OllamaProvider,
    OpenRouterProvider,
    XAIProvider
} from "./openai-compatible.js";

export interface DefaultRegistryOptions {
    anthropic?: AnthropicProviderOptions;
    openai?: OpenAIProviderOptions;
    codex?: OpenAIProviderOptions;
    cursor?: OpenAIProviderOptions;
    gemini?: GeminiProviderOptions;
    bedrock?: BedrockProviderOptions;
    azureOpenAI?: AzureOpenAIProviderOptions;
    vertex?: VertexProviderOptions;
    openrouter?: OpenAIProviderOptions;
    groq?: OpenAIProviderOptions;
    xai?: OpenAIProviderOptions;
    mistral?: OpenAIProviderOptions;
    deepseek?: OpenAIProviderOptions;
    cerebras?: OpenAIProviderOptions;
    ollama?: OllamaProviderOptions;
    llamaCpp?: LlamaCppProviderOptions;
}

export function createDefaultProviderRegistry(options: DefaultRegistryOptions = {}): ProviderRegistry {
    const registry = new ProviderRegistry();

    registry.register({
        name: "anthropic",
        create: (opts?: AnthropicProviderOptions) => new AnthropicProvider({
            oauthProfileId: "claude-code",
            ...options.anthropic,
            ...opts
        }),
        modelPatterns: [/^claude-/i],
        capabilities: { features: ["chat", "tool-calling", "streaming", "multimodal-input", "batch"] }
    });

    registry.register({
        name: "openai",
        create: (opts?: OpenAIProviderOptions) => new OpenAIProvider({
            oauthProfileId: "codex",
            ...options.openai,
            ...opts
        }),
        modelPatterns: [/^gpt-/i, /^o[1-9]/i],
        capabilities: { features: ["chat", "tool-calling", "embeddings", "multimodal-input"] }
    });

    registry.register({
        name: "codex",
        create: (opts?: OpenAIProviderOptions) => new OpenAIProvider({
            oauthProfileId: "codex",
            ...options.codex,
            ...opts
        }),
        modelPatterns: [/^codex\//i],
        capabilities: { features: ["chat", "tool-calling", "embeddings", "multimodal-input"], notes: "OAuth identity profile: codex" }
    });

    registry.register({
        name: "cursor",
        create: (opts?: OpenAIProviderOptions) => new OpenAIProvider({
            oauthProfileId: "cursor",
            ...options.cursor,
            ...opts
        }),
        modelPatterns: [/^cursor\//i],
        capabilities: { features: ["chat", "tool-calling", "embeddings", "multimodal-input"], notes: "OAuth identity profile: cursor" }
    });

    registry.register({
        name: "gemini",
        create: (opts?: GeminiProviderOptions) => new GeminiProvider({
            oauthProfileId: "gemini-cli",
            ...options.gemini,
            ...opts
        }),
        modelPatterns: [/^gemini-/i],
        capabilities: { features: ["chat", "tool-calling", "embeddings", "multimodal-input"] }
    });

    registry.register({
        name: "amazon-bedrock",
        create: (opts?: BedrockProviderOptions) => new BedrockProvider({ ...options.bedrock, ...opts }),
        modelPatterns: [/^anthropic\./i, /^amazon\./i],
        capabilities: { features: ["chat", "tool-calling", "embeddings", "multimodal-input"] }
    });

    registry.register({
        name: "azure-openai",
        create: (opts?: AzureOpenAIProviderOptions) => new AzureOpenAIProvider({ ...options.azureOpenAI, ...opts }),
        modelPatterns: [/^azure\//i],
        capabilities: { features: ["chat", "tool-calling", "embeddings", "multimodal-input"] }
    });

    registry.register({
        name: "vertex",
        create: (opts?: VertexProviderOptions) => new VertexProvider({ ...options.vertex, ...opts }),
        modelPatterns: [/^vertex\//i],
        capabilities: { features: ["chat", "tool-calling", "embeddings", "multimodal-input"] }
    });

    registry.register({
        name: "openrouter",
        create: (opts?: OpenAIProviderOptions) => new OpenRouterProvider({ ...options.openrouter, ...opts }),
        modelPatterns: [/^openrouter\//i],
        capabilities: { features: ["chat", "tool-calling", "embeddings", "multimodal-input"] }
    });

    registry.register({
        name: "groq",
        create: (opts?: OpenAIProviderOptions) => new GroqProvider({ ...options.groq, ...opts }),
        modelPatterns: [/^llama-.*groq/i],
        capabilities: { features: ["chat", "tool-calling"] }
    });

    registry.register({
        name: "xai",
        create: (opts?: OpenAIProviderOptions) => new XAIProvider({ ...options.xai, ...opts }),
        modelPatterns: [/^grok-/i],
        capabilities: { features: ["chat", "tool-calling"] }
    });

    registry.register({
        name: "mistral",
        create: (opts?: OpenAIProviderOptions) => new MistralProvider({ ...options.mistral, ...opts }),
        modelPatterns: [/^mistral-/i],
        capabilities: { features: ["chat", "tool-calling"] }
    });

    registry.register({
        name: "deepseek",
        create: (opts?: OpenAIProviderOptions) => new DeepSeekProvider({ ...options.deepseek, ...opts }),
        modelPatterns: [/^deepseek-/i],
        capabilities: { features: ["chat", "tool-calling"] }
    });

    registry.register({
        name: "cerebras",
        create: (opts?: OpenAIProviderOptions) => new CerebrasProvider({ ...options.cerebras, ...opts }),
        modelPatterns: [/^cerebras-/i],
        capabilities: { features: ["chat", "tool-calling"] }
    });

    registry.register({
        name: "ollama",
        create: (opts?: OllamaProviderOptions) => new OllamaProvider({ ...options.ollama, ...opts }),
        modelPatterns: [/^ollama\//i, /^llama/i],
        capabilities: { features: ["chat", "tool-calling", "embeddings"] }
    });

    registry.register({
        name: "llama-cpp",
        create: (opts?: LlamaCppProviderOptions) => new LlamaCppProvider({ ...options.llamaCpp, ...opts }),
        modelPatterns: [/^llama-cpp\//i, /^gguf\//i],
        capabilities: { features: ["chat", "tool-calling", "embeddings", "multimodal-input"] }
    });

    return registry;
}
