import { OpenAI } from "openai";
import { Provider, ProviderResponse, AgentMessage, ToolDefinition, ProviderModelLimits } from "@omni-agent/core";
import { normalizeToolCall, parseJsonObjectArgs } from "./utils/tool-call-normalizer.js";
import { resolveModelLimits } from "./utils/model-limits.js";
import { normalizeMistralToolCallId, ProviderCompatProfile, resolveProviderCompatProfile } from "./utils/provider-compat.js";
import { transformMessagesForProvider } from "./utils/message-transformer.js";

export interface OpenAIProviderOptions {
    apiKey?: string;
    model?: string;
    embeddingModel?: string;
    baseURL?: string;
    defaultHeaders?: Record<string, string>;
    maxOutputTokens?: number;
    oauthProfileId?: string;
    compatProfile?: ProviderCompatProfile;
}

export class OpenAIProvider implements Provider {
    public name = "openai";
    protected client: OpenAI;
    protected options: OpenAIProviderOptions;

    constructor(options: OpenAIProviderOptions = {}) {
        this.options = {
            model: "gpt-4o",
            embeddingModel: "text-embedding-3-small",
            ...options
        };
        const apiKey = this.options.apiKey || process.env.OPENAI_API_KEY || "";

        this.client = new OpenAI({
            apiKey,
            baseURL: this.options.baseURL,
            defaultHeaders: this.options.defaultHeaders
        });
    }

    public async generateText(
        messages: AgentMessage[],
        tools?: ToolDefinition[]
    ): Promise<ProviderResponse> {
        const compat = this.getCompatProfile();
        const normalizedMessages = transformMessagesForProvider(messages, {
            injectMissingToolResults: true,
            normalizeToolCallId: compat.requiresMistralToolIds ? normalizeMistralToolCallId : undefined
        });

        const openAiMessages: Array<OpenAI.Chat.ChatCompletionMessageParam> = [];

        for (const msg of normalizedMessages) {
            if (msg.role === "system") {
                openAiMessages.push({ role: "system", content: msg.text || "" });
            } else if (msg.role === "user") {
                openAiMessages.push({ role: "user", content: msg.text || "" });
            } else if (msg.role === "assistant") {
                // Approximate mapping
                const tool_calls = msg.toolCalls?.map(call => ({
                    id: call.id || `call_${Date.now()}`,
                    type: "function" as const,
                    function: {
                        name: call.name,
                        arguments: JSON.stringify(call.args)
                    }
                }));

                openAiMessages.push({
                    role: "assistant",
                    content: msg.text || null,
                    tool_calls: tool_calls?.length ? tool_calls : undefined
                });
            } else if (msg.role === "toolResult") {
                const toolMessage: any = {
                    role: "tool",
                    tool_call_id: msg.toolCallId || "UNKNOWN_ID",
                    content: msg.text || ""
                };
                if (compat.requiresToolResultName && msg.toolName) {
                    toolMessage.name = msg.toolName;
                }
                openAiMessages.push(toolMessage);
            }
        }

        const openAiTools: OpenAI.Chat.ChatCompletionTool[] | undefined = tools?.length ? tools.map(t => ({
            type: "function",
            function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters as any // Usually Zod JSON Schema maps fairly well 1:1
            }
        })) : undefined;

        const response = await this.client.chat.completions.create({
            model: this.options.model!,
            messages: openAiMessages,
            tools: openAiTools
        });

        const choice = response.choices[0];
        let finalString = choice.message?.content || "";
        const parsedToolCalls: any[] = [];

        if (choice.message?.tool_calls) {
            for (const call of choice.message.tool_calls) {
                if (call.type === "function") {
                    parsedToolCalls.push(normalizeToolCall({
                        id: call.id,
                        name: call.function.name,
                        args: parseJsonObjectArgs(call.function.arguments)
                    }));
                }
            }
        }

        return {
            text: finalString,
            toolCalls: parsedToolCalls,
            requestId: (response as any)?._request_id || (response as any)?.id,
            provider: this.name,
            model: this.options.model,
            usage: response.usage ? {
                inputTokens: response.usage.prompt_tokens,
                outputTokens: response.usage.completion_tokens
            } : undefined
        };
    }

    public async embedText(text: string): Promise<number[]> {
        const response = await this.client.embeddings.create({
            model: this.options.embeddingModel || "text-embedding-3-small",
            input: text
        });
        return response.data[0]?.embedding || [];
    }

    public async embedBatch(texts: string[]): Promise<number[][]> {
        const response = await this.client.embeddings.create({
            model: this.options.embeddingModel || "text-embedding-3-small",
            input: texts
        });
        return response.data.map(d => d.embedding);
    }

    public async listAvailableModels(): Promise<string[]> {
        try {
            const response = await this.client.models.list();
            const data = (response as any)?.data || [];
            return data.map((item: any) => item.id).filter(Boolean);
        } catch {
            return [this.options.model || "gpt-4o"];
        }
    }

    public getModelLimits(model?: string): ProviderModelLimits {
        const activeModel = model || this.options.model || "unknown-model";
        return resolveModelLimits(this.name, activeModel, this.options.maxOutputTokens ?? null);
    }

    public getOAuthProfileId(): string | undefined {
        return this.options.oauthProfileId;
    }

    protected getCompatProfile(): ProviderCompatProfile {
        if (this.options.compatProfile) {
            return this.options.compatProfile;
        }
        return resolveProviderCompatProfile(this.name, this.options.baseURL);
    }
}
