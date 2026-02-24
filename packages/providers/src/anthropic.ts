import { Anthropic } from "@anthropic-ai/sdk";
import { Provider, ProviderResponse, AgentMessage, ToolDefinition, ProviderModelLimits } from "@omni-agent/core";
import { zodToJsonSchema } from "zod-to-json-schema";
import { normalizeToolCall } from "./utils/tool-call-normalizer.js";
import { resolveModelLimits } from "./utils/model-limits.js";

type MessageParam = Anthropic.MessageParam;
type Tool = Anthropic.Tool;

export interface AnthropicProviderOptions {
    apiKey?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    stopSequences?: string[];
    betas?: string[];
    oauthProfileId?: string;
}

export interface AnthropicGenerateOptions {
    system?: string;
    metadata?: Record<string, unknown>;
    thinking?: { type: string; budget_tokens?: number };
    toolChoice?: any;
    mcpServers?: Array<{ type: string; url: string; name: string }>;
    includeThinkingInText?: boolean;
    topP?: number;
    topK?: number;
    stopSequences?: string[];
    temperature?: number;
    maxTokens?: number;
}

function contentFromDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    return { mediaType: match[1], data: match[2] };
}

function mapMessageToAnthropic(msg: AgentMessage): MessageParam | null {
    if (msg.role === "system") {
        return null;
    }

    if (msg.role === "user") {
        if (typeof msg.content === "string") {
            return { role: "user", content: msg.text || msg.content || "" };
        }

        const blocks: any[] = [];
        for (const part of msg.content || []) {
            if (part.type === "text") {
                blocks.push({ type: "text", text: part.text });
            } else if (part.type === "image_url") {
                const parsed = contentFromDataUrl(part.url);
                if (parsed) {
                    blocks.push({
                        type: "image",
                        source: {
                            type: "base64",
                            media_type: parsed.mediaType,
                            data: parsed.data
                        }
                    });
                }
            }
        }

        if (blocks.length === 0) {
            blocks.push({ type: "text", text: msg.text || "" });
        }

        return { role: "user", content: blocks as any };
    }

    if (msg.role === "assistant") {
        const contentBlocks: any[] = [];
        if (msg.text) {
            contentBlocks.push({ type: "text", text: msg.text });
        }
        if (msg.toolCalls && msg.toolCalls.length > 0) {
            for (const call of msg.toolCalls) {
                contentBlocks.push({
                    type: "tool_use",
                    id: call.id,
                    name: call.name,
                    input: call.args
                });
            }
        }
        return { role: "assistant", content: contentBlocks as any };
    }

    if (msg.role === "toolResult") {
        return {
            role: "user",
            content: [
                {
                    type: "tool_result",
                    tool_use_id: msg.toolCallId || "UNKNOWN_ID",
                    content: msg.text || ""
                }
            ]
        } as any;
    }

    return null;
}

export class AnthropicProvider implements Provider {
    public readonly name = "anthropic";
    private client: Anthropic;
    private options: AnthropicProviderOptions;

    constructor(options: AnthropicProviderOptions = {}) {
        this.options = {
            model: "claude-3-5-sonnet-20241022",
            maxTokens: 4096,
            temperature: 0,
            ...options
        };
        const apiKey = this.options.apiKey || process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            throw new Error("Anthropic API key is required. Set ANTHROPIC_API_KEY env var or pass in options.");
        }
        this.client = new Anthropic({ apiKey });
    }

    public get rawClient(): Anthropic {
        return this.client;
    }

    public async generateText(
        messages: AgentMessage[],
        tools?: ToolDefinition[],
        options?: AnthropicGenerateOptions
    ): Promise<ProviderResponse> {
        const anthropicMessages: MessageParam[] = [];
        let systemPrompt = "";

        for (const msg of messages) {
            if (msg.role === "system") {
                systemPrompt += (msg.text || "") + "\n";
                continue;
            }

            const mapped = mapMessageToAnthropic(msg);
            if (mapped) {
                anthropicMessages.push(mapped);
            }
        }

        const anthropicTools: Tool[] = (tools || []).map((t) => ({
            name: t.name,
            description: t.description,
            input_schema: zodToJsonSchema(t.parameters as any) as any
        }));

        const response = await this.client.messages.create({
            model: this.options.model!,
            max_tokens: options?.maxTokens ?? this.options.maxTokens!,
            temperature: options?.temperature ?? this.options.temperature,
            top_p: options?.topP ?? this.options.topP,
            top_k: options?.topK ?? this.options.topK,
            stop_sequences: options?.stopSequences ?? this.options.stopSequences,
            system: options?.system || (systemPrompt.trim() ? systemPrompt.trim() : undefined),
            messages: anthropicMessages,
            tools: anthropicTools.length > 0 ? anthropicTools : undefined,
            tool_choice: options?.toolChoice,
            metadata: options?.metadata as any,
            thinking: options?.thinking as any,
            mcp_servers: options?.mcpServers as any,
            betas: this.options.betas as any
        } as any);

        let finalString = "";
        const parsedToolCalls: any[] = [];

        for (const block of response.content as any[]) {
            if (block.type === "text") {
                finalString += block.text;
            } else if (block.type === "thinking" && options?.includeThinkingInText) {
                finalString += `\n[thinking]\n${block.thinking}`;
            } else if (block.type === "tool_use") {
                parsedToolCalls.push(normalizeToolCall({
                    id: block.id,
                    name: block.name,
                    args: block.input
                }));
            }
        }

        return {
            text: finalString,
            toolCalls: parsedToolCalls,
            usage: {
                inputTokens: response.usage.input_tokens,
                outputTokens: response.usage.output_tokens,
                thinkingTokens: (response.usage as any).thinking_tokens || 0
            }
        };
    }

    // ========= Anthropic SDK advanced resources =========

    public async createRawMessage(params: any, requestOptions?: any): Promise<any> {
        return this.client.messages.create(params, requestOptions);
    }

    public streamRawMessages(params: any, requestOptions?: any): Promise<any> {
        return this.client.messages.create({ ...params, stream: true }, requestOptions);
    }

    public streamWithHelpers(params: any, requestOptions?: any): any {
        return this.client.messages.stream(params, requestOptions);
    }

    public async parseMessage(params: any, requestOptions?: any): Promise<any> {
        return (this.client.messages as any).parse(params, requestOptions);
    }

    public async countTokens(params: any, requestOptions?: any): Promise<any> {
        return this.client.messages.countTokens(params, requestOptions);
    }

    public async createMessageBatch(params: any, requestOptions?: any): Promise<any> {
        return this.client.messages.batches.create(params, requestOptions);
    }

    public async retrieveMessageBatch(batchId: string, requestOptions?: any): Promise<any> {
        return this.client.messages.batches.retrieve(batchId, requestOptions);
    }

    public listMessageBatches(params?: any, requestOptions?: any): any {
        return this.client.messages.batches.list(params, requestOptions);
    }

    public async cancelMessageBatch(batchId: string, requestOptions?: any): Promise<any> {
        return this.client.messages.batches.cancel(batchId, requestOptions);
    }

    public async deleteMessageBatch(batchId: string, requestOptions?: any): Promise<any> {
        return this.client.messages.batches.delete(batchId, requestOptions);
    }

    public async streamMessageBatchResults(batchId: string, requestOptions?: any): Promise<any> {
        return this.client.messages.batches.results(batchId, requestOptions);
    }

    public async retrieveModel(modelId: string, params?: any, requestOptions?: any): Promise<any> {
        if (params) {
            return (this.client.models as any).retrieve(modelId, params, requestOptions);
        }
        return this.client.models.retrieve(modelId, requestOptions);
    }

    public listModels(params?: any, requestOptions?: any): any {
        return this.client.models.list(params, requestOptions);
    }

    public async listAvailableModels(): Promise<string[]> {
        try {
            const page = await (this.client.models as any).list();
            const data = page?.data || [];
            return data.map((item: any) => item.id).filter(Boolean);
        } catch {
            return [this.options.model || "claude-3-5-sonnet-20241022"];
        }
    }

    public async betaToolRunner(params: any): Promise<any> {
        return (this.client as any).beta.messages.toolRunner(params);
    }

    public async betaCreateMessage(params: any, requestOptions?: any): Promise<any> {
        return (this.client as any).beta.messages.create(params, requestOptions);
    }

    public async betaUploadFile(params: any, requestOptions?: any): Promise<any> {
        return (this.client as any).beta.files.upload(params, requestOptions);
    }

    public betaListFiles(params?: any, requestOptions?: any): any {
        return (this.client as any).beta.files.list(params, requestOptions);
    }

    public async betaRetrieveFileMetadata(fileId: string, params?: any, requestOptions?: any): Promise<any> {
        return (this.client as any).beta.files.retrieveMetadata(fileId, params, requestOptions);
    }

    public async betaDownloadFile(fileId: string, params?: any, requestOptions?: any): Promise<any> {
        return (this.client as any).beta.files.download(fileId, params, requestOptions);
    }

    public async betaDeleteFile(fileId: string, params?: any, requestOptions?: any): Promise<any> {
        return (this.client as any).beta.files.delete(fileId, params, requestOptions);
    }

    public async embedText(_text: string): Promise<number[]> {
        throw new Error("Embeddings are not available in Anthropic Messages API. Use a dedicated embedding provider.");
    }

    public async embedBatch(_texts: string[]): Promise<number[][]> {
        throw new Error("Embeddings are not available in Anthropic Messages API. Use a dedicated embedding provider.");
    }

    public getModelLimits(model?: string): ProviderModelLimits {
        const activeModel = model || this.options.model || "unknown-model";
        return resolveModelLimits(this.name, activeModel, this.options.maxTokens ?? null);
    }

    public getOAuthProfileId(): string | undefined {
        return this.options.oauthProfileId;
    }
}
