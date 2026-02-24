import { BedrockRuntimeClient, ConverseCommand, InvokeModelCommand, Message, Tool } from "@aws-sdk/client-bedrock-runtime";
import { Provider, ProviderResponse, AgentMessage, ToolDefinition, ProviderModelLimits } from "@omni-agent/core";
import { zodToJsonSchema } from "zod-to-json-schema";
import { normalizeToolCall } from "./utils/tool-call-normalizer.js";
import { resolveModelLimits } from "./utils/model-limits.js";

export interface BedrockProviderOptions {
    region?: string;
    model?: string;
    embeddingModel?: string;
    maxTokens?: number;
    temperature?: number;
}

export class BedrockProvider implements Provider {
    public readonly name = "amazon-bedrock";
    private client: BedrockRuntimeClient;
    private options: BedrockProviderOptions;

    constructor(options: BedrockProviderOptions = {}) {
        this.options = {
            region: "us-east-1",
            model: "anthropic.claude-3-5-sonnet-20241022-v2:0",
            embeddingModel: "amazon.titan-embed-text-v2:0",
            maxTokens: 4096,
            temperature: 0,
            ...options
        };
        this.client = new BedrockRuntimeClient({ region: this.options.region });
    }

    public async generateText(
        messages: AgentMessage[],
        tools?: ToolDefinition[]
    ): Promise<ProviderResponse> {

        const bedrockMessages: Message[] = [];
        const systemPrompts: { text: string }[] = [];

        for (const msg of messages) {
            if (msg.role === "system") {
                systemPrompts.push({ text: msg.text || "" });
            } else if (msg.role === "user") {
                bedrockMessages.push({ role: "user", content: [{ text: msg.text || "" }] });
            } else if (msg.role === "assistant") {
                const contentBlocks: any[] = [];
                if (msg.text) contentBlocks.push({ text: msg.text });
                if (msg.toolCalls && msg.toolCalls.length > 0) {
                    for (const call of msg.toolCalls) {
                        contentBlocks.push({
                            toolUse: {
                                toolUseId: call.id || `call_${Date.now()}`,
                                name: call.name,
                                input: call.args
                            }
                        });
                    }
                }
                bedrockMessages.push({ role: "assistant", content: contentBlocks });
            } else if (msg.role === "toolResult") {
                bedrockMessages.push({
                    role: "user",
                    content: [
                        {
                            toolResult: {
                                toolUseId: msg.toolCallId || "UNKNOWN_ID",
                                content: [{ text: msg.text || "" }]
                                // Bedrock also supports status: 'success' | 'error'
                            }
                        }
                    ]
                });
            }
        }

        const bedrockTools: Tool[] | undefined = tools?.length ? tools.map(t => ({
            toolSpec: {
                name: t.name,
                description: t.description,
                inputSchema: {
                    json: zodToJsonSchema(t.parameters as any) as any
                }
            }
        })) : undefined;

        const command = new ConverseCommand({
            modelId: this.options.model,
            system: systemPrompts.length > 0 ? systemPrompts : undefined,
            messages: bedrockMessages,
            toolConfig: bedrockTools ? { tools: bedrockTools } : undefined,
            inferenceConfig: {
                maxTokens: this.options.maxTokens,
                temperature: this.options.temperature
            }
        });

        const response = await this.client.send(command);

        let finalString = "";
        const parsedToolCalls: any[] = [];

        if (response.output?.message?.content) {
            for (const block of response.output.message.content) {
                if (block.text) {
                    finalString += block.text;
                } else if (block.toolUse) {
                    parsedToolCalls.push(normalizeToolCall({
                        id: block.toolUse.toolUseId,
                        name: block.toolUse.name,
                        args: block.toolUse.input
                    }));
                }
            }
        }

        return {
            text: finalString,
            toolCalls: parsedToolCalls,
            usage: response.usage ? {
                inputTokens: response.usage.inputTokens || 0,
                outputTokens: response.usage.outputTokens || 0
            } : undefined
        };
    }

    public async embedText(text: string): Promise<number[]> {
        const command = new InvokeModelCommand({
            modelId: this.options.embeddingModel,
            contentType: "application/json",
            accept: "application/json",
            body: JSON.stringify({ inputText: text })
        });

        const response = await this.client.send(command);
        const bodyText = new TextDecoder("utf-8").decode(response.body);
        const data = JSON.parse(bodyText);
        return data.embedding || data.vector || [];
    }

    public async embedBatch(texts: string[]): Promise<number[][]> {
        const vectors: number[][] = [];
        for (const text of texts) {
            vectors.push(await this.embedText(text));
        }
        return vectors;
    }

    public getModelLimits(model?: string): ProviderModelLimits {
        const activeModel = model || this.options.model || "unknown-model";
        return resolveModelLimits(this.name, activeModel, this.options.maxTokens ?? null);
    }
}
