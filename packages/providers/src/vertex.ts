import { GoogleGenAI, Type } from "@google/genai";
import { Provider, ProviderResponse, AgentMessage, ToolDefinition } from "@omni-agent/core";
import { GeminiProvider, GeminiProviderOptions } from "./gemini.js";

export interface VertexProviderOptions extends GeminiProviderOptions {
    project?: string;
    location?: string;
}

export class VertexProvider extends GeminiProvider {
    constructor(options: VertexProviderOptions = {}) {
        const project = options.project || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
        const location = options.location || process.env.GOOGLE_CLOUD_LOCATION;

        if (!project || !location) {
            throw new Error("Vertex AI requires GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION environment variables.");
        }

        super({
            model: "gemini-2.5-flash",
            ...options,
        });

        this.name = "vertex";

        // Override the client for Vertex AI specifically
        // @ts-ignore - bypassing private modifier in GeminiProvider for simplicity
        this.client = new GoogleGenAI({
            vertexai: true,
            project,
            location
        });
    }
}
