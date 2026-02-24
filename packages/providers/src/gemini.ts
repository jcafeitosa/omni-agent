import { GoogleGenAI, Type } from "@google/genai";
import { Provider, ProviderResponse, AgentMessage, ToolDefinition, ProviderModelLimits } from "@omni-agent/core";
import { normalizeToolCall } from "./utils/tool-call-normalizer.js";
import { resolveModelLimits } from "./utils/model-limits.js";

export interface GeminiProviderOptions {
    apiKey?: string;
    model?: string;
    oauthProfileId?: string;
}

export class GeminiProvider implements Provider {
    public name = "gemini";
    protected client: GoogleGenAI;
    protected options: GeminiProviderOptions;

    constructor(options: GeminiProviderOptions = {}) {
        this.options = {
            model: "gemini-2.5-flash",
            ...options
        };
        const apiKey = this.options.apiKey || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error("Gemini API key is required. Set GEMINI_API_KEY env var or pass in options.");
        }
        this.client = new GoogleGenAI({ apiKey });
    }

    public async generateText(
        messages: AgentMessage[],
        tools?: ToolDefinition[]
    ): Promise<ProviderResponse> {

        let systemInstruction = "";
        const geminiContents: any[] = [];

        for (const msg of messages) {
            if (msg.role === "system") {
                systemInstruction += (msg.text || "") + "\n";
            } else if (msg.role === "user") {
                geminiContents.push({ role: "user", parts: [{ text: msg.text || "" }] });
            } else if (msg.role === "assistant") {
                const parts: any[] = [];
                if (msg.text) parts.push({ text: msg.text });
                if (msg.toolCalls && msg.toolCalls.length > 0) {
                    for (const call of msg.toolCalls) {
                        parts.push({
                            functionCall: {
                                name: call.name,
                                args: call.args
                            }
                        });
                    }
                }
                geminiContents.push({ role: "model", parts });
            } else if (msg.role === "toolResult") {
                geminiContents.push({
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

        const geminiTools = tools ? [{
            functionDeclarations: tools.map(t => ({
                name: t.name,
                description: t.description,
                parameters: {
                    type: Type.OBJECT,
                    properties: (t.parameters as any)?.properties || {},
                    required: (t.parameters as any)?.required || []
                }
            }))
        }] : undefined;

        const response = await this.client.models.generateContent({
            model: this.options.model!,
            contents: geminiContents,
            config: {
                systemInstruction: systemInstruction.trim() ? { parts: [{ text: systemInstruction.trim() }] } as any : undefined,
                tools: geminiTools
            }
        });

        let finalString = "";
        const parsedToolCalls: any[] = [];

        if (response.candidates && response.candidates.length > 0) {
            const candidate = response.candidates[0];
            if (candidate.content && candidate.content.parts) {
                for (const part of candidate.content.parts) {
                    if (part.text) finalString += part.text;
                    if (part.functionCall) {
                        parsedToolCalls.push(normalizeToolCall({
                            name: part.functionCall.name,
                            args: part.functionCall.args
                        }));
                    }
                }
            }
        }

        return {
            text: finalString,
            toolCalls: parsedToolCalls,
            usage: response.usageMetadata ? {
                inputTokens: response.usageMetadata.promptTokenCount || 0,
                outputTokens: response.usageMetadata.candidatesTokenCount || 0,
            } : undefined
        };
    }

    public async embedText(text: string): Promise<number[]> {
        const response = await this.client.models.embedContent({
            model: "text-embedding-004",
            contents: [{ parts: [{ text }] }]
        });
        return response.embeddings?.[0]?.values || [];
    }

    public async embedBatch(texts: string[]): Promise<number[][]> {
        // In @google/genai 2.5+, batch embedding is done via embedContent with multiple contents
        const response = await this.client.models.embedContent({
            model: "text-embedding-004",
            contents: texts.map(text => ({ parts: [{ text }] }))
        });
        return response.embeddings?.map(e => e.values || []) || [];
    }

    public async listAvailableModels(): Promise<string[]> {
        try {
            const maybeListFn = (this.client.models as any).list;
            if (typeof maybeListFn === "function") {
                const response = await maybeListFn.call(this.client.models);
                const data = response?.models || response?.data || [];
                return data
                    .map((item: any) => item.name || item.id)
                    .filter(Boolean)
                    .map((id: string) => id.replace(/^models\//, ""));
            }
        } catch {
            // fall through
        }

        return [this.options.model || "gemini-2.5-flash"];
    }

    public getModelLimits(model?: string): ProviderModelLimits {
        const activeModel = model || this.options.model || "unknown-model";
        return resolveModelLimits(this.name, activeModel, null);
    }

    public getOAuthProfileId(): string | undefined {
        return this.options.oauthProfileId;
    }
}
