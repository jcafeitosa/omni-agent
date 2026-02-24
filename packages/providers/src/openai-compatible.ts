import { OpenAIProvider, OpenAIProviderOptions } from "./openai.js";

export class GroqProvider extends OpenAIProvider {
    constructor(options: OpenAIProviderOptions = {}) {
        const apiKey = options.apiKey || process.env.GROQ_API_KEY;
        if (!apiKey) throw new Error("GROQ_API_KEY is required.");
        super({
            model: "llama-3.3-70b-versatile",
            ...options,
            apiKey,
            baseURL: "https://api.groq.com/openai/v1"
        });
        this.name = "groq";
    }
}

export class XAIProvider extends OpenAIProvider {
    constructor(options: OpenAIProviderOptions = {}) {
        const apiKey = options.apiKey || process.env.XAI_API_KEY;
        if (!apiKey) throw new Error("XAI_API_KEY is required.");
        super({
            model: "grok-2-latest",
            ...options,
            apiKey,
            baseURL: "https://api.x.ai/v1"
        });
        this.name = "xai";
    }
}

export class OpenRouterProvider extends OpenAIProvider {
    constructor(options: OpenAIProviderOptions = {}) {
        const apiKey = options.apiKey || process.env.OPENROUTER_API_KEY;
        if (!apiKey) throw new Error("OPENROUTER_API_KEY is required.");
        super({
            model: "openai/gpt-4o",
            ...options,
            apiKey,
            baseURL: "https://openrouter.ai/api/v1",
            defaultHeaders: {
                "HTTP-Referer": "https://github.com/omni-agent",
                "X-Title": "OmniAgent",
                ...options.defaultHeaders
            }
        });
        this.name = "openrouter";
    }
}

export class MistralProvider extends OpenAIProvider {
    constructor(options: OpenAIProviderOptions = {}) {
        const apiKey = options.apiKey || process.env.MISTRAL_API_KEY;
        if (!apiKey) throw new Error("MISTRAL_API_KEY is required.");
        super({
            model: "mistral-large-latest",
            ...options,
            apiKey,
            baseURL: "https://api.mistral.ai/v1"
        });
        this.name = "mistral";
    }
}

export class DeepSeekProvider extends OpenAIProvider {
    constructor(options: OpenAIProviderOptions = {}) {
        const apiKey = options.apiKey || process.env.DEEPSEEK_API_KEY;
        if (!apiKey) throw new Error("DEEPSEEK_API_KEY is required.");
        super({
            model: "deepseek-chat",
            ...options,
            apiKey,
            baseURL: "https://api.deepseek.com/v1"
        });
        this.name = "deepseek";
    }
}

export class CerebrasProvider extends OpenAIProvider {
    constructor(options: OpenAIProviderOptions = {}) {
        const apiKey = options.apiKey || process.env.CEREBRAS_API_KEY;
        if (!apiKey) throw new Error("CEREBRAS_API_KEY is required.");
        super({
            model: "llama3.1-8b",
            ...options,
            apiKey,
            baseURL: "https://api.cerebras.ai/v1"
        });
        this.name = "cerebras";
    }
}

export class OllamaProvider extends OpenAIProvider {
    constructor(options: OllamaProviderOptions = {}) {
        const baseURL = resolveOllamaBaseUrl(options);
        const token = options.token || process.env.OLLAMA_API_KEY;

        super({
            model: "llama3",
            ...options,
            apiKey: options.apiKey || "ollama",
            baseURL,
            defaultHeaders: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                ...options.defaultHeaders
            }
        });
        this.name = "ollama";
    }
}

export interface OllamaProviderOptions extends OpenAIProviderOptions {
    connection?: "local" | "remote";
    protocol?: "http" | "https";
    host?: string;
    port?: number;
    token?: string;
}

function resolveOllamaBaseUrl(options: OllamaProviderOptions): string {
    if (options.baseURL) {
        return options.baseURL;
    }

    if (process.env.OLLAMA_BASE_URL) {
        return process.env.OLLAMA_BASE_URL;
    }

    const connection = options.connection || (process.env.OLLAMA_CONNECTION as "local" | "remote") || "local";

    if (connection === "remote") {
        const protocol = options.protocol || (process.env.OLLAMA_PROTOCOL as "http" | "https") || "https";
        const host = options.host || process.env.OLLAMA_HOST;
        const port = options.port || (process.env.OLLAMA_PORT ? Number(process.env.OLLAMA_PORT) : undefined);

        if (!host) {
            throw new Error("OLLAMA_HOST is required for remote Ollama connection.");
        }

        return `${protocol}://${host}${port ? `:${port}` : ""}/v1`;
    }

    const protocol = options.protocol || "http";
    const host = options.host || "127.0.0.1";
    const port = options.port || 11434;
    return `${protocol}://${host}:${port}/v1`;
}
