import { AzureOpenAI } from "openai";
import { Provider, ProviderResponse, AgentMessage, ToolDefinition } from "@omni-agent/core";
import { OpenAIProvider, OpenAIProviderOptions } from "./openai.js";

export interface AzureOpenAIProviderOptions extends OpenAIProviderOptions {
    apiVersion?: string;
    deployment?: string;
    endpoint?: string;
}

export class AzureOpenAIProvider extends OpenAIProvider {
    constructor(options: AzureOpenAIProviderOptions = {}) {
        super({
            model: options.deployment || options.model || "gpt-4o",
            ...options
        });

        const apiKey = this.options.apiKey || process.env.AZURE_OPENAI_API_KEY || "";
        const apiVersion = options.apiVersion || process.env.AZURE_OPENAI_API_VERSION || "2024-05-01-preview";
        const endpoint = options.endpoint || process.env.AZURE_OPENAI_ENDPOINT;

        if (!endpoint) {
            throw new Error("Azure OpenAI requires AZURE_OPENAI_ENDPOINT environment variable.");
        }

        this.name = "azure-openai";

        this.client = new AzureOpenAI({
            apiKey,
            apiVersion,
            endpoint,
            defaultHeaders: this.options.defaultHeaders
        });
    }
}
