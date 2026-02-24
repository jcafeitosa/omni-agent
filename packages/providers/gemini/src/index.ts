import { Provider, ToolDefinition } from "@omni-agent/core";
import { GoogleGenAI } from "@google/genai";

export interface GeminiProviderOptions {
    apiKey?: string;
    model?: string;
    systemPrompt?: string;
}

export class GeminiProvider implements Provider {
    public name = "gemini";
    private client: GoogleGenAI;
    private model: string;
    private systemPrompt: string;

    constructor(options: GeminiProviderOptions = {}) {
        this.client = new GoogleGenAI({
            apiKey: options.apiKey || process.env.GEMINI_API_KEY,
        });
        this.model = options.model || "gemini-2.5-pro";
        this.systemPrompt = options.systemPrompt || "";
    }

    // Basic implementation to adhere to Provider interface
    async generateText(prompt: string, options?: { tools: ToolDefinition[] }): Promise<string> {
        const response = await this.client.models.generateContent({
            model: this.model,
            contents: prompt,
            config: {
                systemInstruction: this.systemPrompt,
                // In a real scenario, map "options.tools" to Gemini tools
            }
        });

        return response.text || "";
    }
}
