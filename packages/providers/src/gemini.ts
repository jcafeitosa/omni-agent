import { Provider, ProviderResponse, AgentMessage, ToolDefinition, ProviderModelLimits } from "@omni-agent/core";
import { zodToJsonSchema } from "zod-to-json-schema";
import { normalizeToolCall } from "./utils/tool-call-normalizer.js";
import { resolveModelLimits } from "./utils/model-limits.js";

export interface GeminiProviderOptions {
    apiKey?: string;
    model?: string;
    oauthProfileId?: string;
    baseUrl?: string;
}

interface GeminiGenerateResponse {
    candidates?: Array<{
        content?: {
            parts?: Array<{
                text?: string;
                functionCall?: { name?: string; args?: unknown };
            }>;
        };
    }>;
    usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
    };
    responseId?: string;
    id?: string;
}

export class GeminiProvider implements Provider {
    public name = "gemini";
    protected options: GeminiProviderOptions;
    private readonly apiKey: string;
    private readonly baseUrl: string;

    constructor(options: GeminiProviderOptions = {}) {
        this.options = {
            model: "gemini-2.5-flash",
            ...options
        };
        this.apiKey = this.options.apiKey || process.env.GEMINI_API_KEY || "";
        if (!this.apiKey) {
            throw new Error("Gemini API key is required. Set GEMINI_API_KEY env var or pass in options.");
        }
        this.baseUrl = this.options.baseUrl || process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
    }

    public async generateText(messages: AgentMessage[], tools?: ToolDefinition[]): Promise<ProviderResponse> {
        let systemInstruction = "";
        const contents: any[] = [];

        for (const msg of messages) {
            if (msg.role === "system") {
                systemInstruction += (msg.text || "") + "\n";
                continue;
            }
            if (msg.role === "user") {
                contents.push({ role: "user", parts: [{ text: msg.text || "" }] });
                continue;
            }
            if (msg.role === "assistant") {
                const parts: any[] = [];
                if (msg.text) parts.push({ text: msg.text });
                if (msg.toolCalls?.length) {
                    for (const call of msg.toolCalls) {
                        parts.push({ functionCall: { name: call.name, args: call.args } });
                    }
                }
                contents.push({ role: "model", parts });
                continue;
            }
            if (msg.role === "toolResult") {
                contents.push({
                    role: "user",
                    parts: [{
                        functionResponse: {
                            name: msg.toolName || "tool_use",
                            response: { result: msg.text || "" }
                        }
                    }]
                });
            }
        }

        const geminiTools = tools?.length
            ? [{
                  functionDeclarations: tools.map((tool) => {
                      const schema = zodToJsonSchema(tool.parameters, { target: "openApi3" }) as any;
                      return {
                          name: tool.name,
                          description: tool.description,
                          parameters: schema || { type: "object", properties: {}, required: [] }
                      };
                  })
              }]
            : undefined;

        const payload = {
            contents,
            systemInstruction: systemInstruction.trim() ? { parts: [{ text: systemInstruction.trim() }] } : undefined,
            tools: geminiTools
        };

        const model = this.options.model || "gemini-2.5-flash";
        const response = await this.request<GeminiGenerateResponse>(`/models/${encodeURIComponent(model)}:generateContent`, {
            method: "POST",
            body: JSON.stringify(payload)
        });

        let finalText = "";
        const parsedToolCalls: ProviderResponse["toolCalls"] = [];
        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.text) finalText += part.text;
            if (part.functionCall) {
                parsedToolCalls?.push(
                    normalizeToolCall({
                        name: part.functionCall.name,
                        args: part.functionCall.args
                    })
                );
            }
        }

        return {
            text: finalText,
            toolCalls: parsedToolCalls,
            requestId: response.responseId || response.id,
            provider: this.name,
            model,
            usage: response.usageMetadata
                ? {
                      inputTokens: response.usageMetadata.promptTokenCount || 0,
                      outputTokens: response.usageMetadata.candidatesTokenCount || 0
                  }
                : undefined
        };
    }

    public async embedText(text: string): Promise<number[]> {
        const response = await this.request<any>(`/models/text-embedding-004:embedContent`, {
            method: "POST",
            body: JSON.stringify({
                content: {
                    parts: [{ text }]
                }
            })
        });
        return response?.embedding?.values || response?.embeddings?.[0]?.values || [];
    }

    public async embedBatch(texts: string[]): Promise<number[][]> {
        const out: number[][] = [];
        for (const text of texts) {
            out.push(await this.embedText(text));
        }
        return out;
    }

    public async listAvailableModels(): Promise<string[]> {
        try {
            const response = await this.request<any>("/models", { method: "GET" });
            const data = response?.models || [];
            const models = data
                .map((item: any) => String(item.name || item.id || ""))
                .filter(Boolean)
                .map((id: string) => id.replace(/^models\//, ""));
            return models.length ? models : [this.options.model || "gemini-2.5-flash"];
        } catch {
            return [this.options.model || "gemini-2.5-flash"];
        }
    }

    public getModelLimits(model?: string): ProviderModelLimits {
        const activeModel = model || this.options.model || "unknown-model";
        return resolveModelLimits(this.name, activeModel, null);
    }

    public getOAuthProfileId(): string | undefined {
        return this.options.oauthProfileId;
    }

    private async request<T>(path: string, init: RequestInit): Promise<T> {
        const url = new URL(`${this.baseUrl.replace(/\/$/, "")}${path}`);
        url.searchParams.set("key", this.apiKey);
        const response = await fetch(url, {
            ...init,
            headers: {
                "Content-Type": "application/json",
                ...(init.headers || {})
            }
        });
        const text = await response.text();
        const data = text ? JSON.parse(text) : {};
        if (!response.ok) {
            const message = data?.error?.message || `Gemini API request failed (${response.status})`;
            throw new Error(message);
        }
        return data as T;
    }
}
