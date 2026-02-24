import { GeminiProvider, GeminiProviderOptions } from "./gemini.js";

export interface VertexProviderOptions extends GeminiProviderOptions {
    project?: string;
    location?: string;
    baseUrl?: string;
}

export class VertexProvider extends GeminiProvider {
    constructor(options: VertexProviderOptions = {}) {
        const project = options.project || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
        const location = options.location || process.env.GOOGLE_CLOUD_LOCATION;

        // Keep project/location contract explicit for Vertex usage flows.
        if (!project || !location) {
            throw new Error("Vertex AI requires GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION environment variables.");
        }

        super({
            model: "gemini-2.5-flash",
            ...options,
            baseUrl: options.baseUrl || process.env.VERTEX_API_BASE_URL || process.env.GEMINI_BASE_URL
        });

        this.name = "vertex";
    }
}
