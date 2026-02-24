import { Provider, ToolDefinition } from "@omni-agent/core";

export interface GeminiProviderOptions {
    apiKey?: string;
    model?: string;
    systemPrompt?: string;
    baseUrl?: string;
}

export class GeminiProvider implements Provider {
    public name = "gemini";
    private apiKey: string;
    private model: string;
    private systemPrompt: string;
    private baseUrl: string;

    constructor(options: GeminiProviderOptions = {}) {
        this.apiKey = options.apiKey || process.env.GEMINI_API_KEY || "";
        if (!this.apiKey) {
            throw new Error("Gemini API key is required.");
        }
        this.model = options.model || "gemini-2.5-pro";
        this.systemPrompt = options.systemPrompt || "";
        this.baseUrl = (options.baseUrl || process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/$/, "");
    }

    // Basic implementation to adhere to Provider interface
    async generateText(prompt: string, options?: { tools: ToolDefinition[] }): Promise<string> {
        void options;
        const url = new URL(`${this.baseUrl}/models/${encodeURIComponent(this.model)}:generateContent`);
        url.searchParams.set("key", this.apiKey);

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                systemInstruction: this.systemPrompt ? { parts: [{ text: this.systemPrompt }] } : undefined
            })
        });
        const payload = (await response.json()) as any;
        if (!response.ok) {
            throw new Error(payload?.error?.message || `Gemini request failed (${response.status})`);
        }

        return payload?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || "").join("") || "";
    }
}
