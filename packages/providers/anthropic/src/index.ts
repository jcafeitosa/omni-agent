import { Provider, ToolDefinition, Message, MessagePart } from "@omni-agent/core";
import Anthropic from "@anthropic-ai/sdk";

export interface AnthropicProviderOptions {
    apiKey?: string;
    model?: string;
    systemPrompt?: string;
}

export class AnthropicProvider implements Provider {
    public name = "anthropic";
    private client: Anthropic;
    private model: string;
    private systemPrompt: string;

    constructor(options: AnthropicProviderOptions = {}) {
        this.client = new Anthropic({
            apiKey: options.apiKey || process.env.ANTHROPIC_API_KEY,
        });
        this.model = options.model || "claude-3-5-sonnet-latest";
        this.systemPrompt = options.systemPrompt || "";
    }

    // Very basic prompt mapping for Phase 2:
    // Convert our standardized Message[] history back to what Anthropic SDK wants
    async generateText(prompt: string, options?: { tools: ToolDefinition[] }): Promise<string> {

        // In a real adapter we would map `prompt` and history to Anthropic `MessageParam[]`
        const message = await this.client.messages.create({
            model: this.model,
            max_tokens: 1024,
            system: this.systemPrompt,
            messages: [{ role: "user", content: prompt }], // simplistic
            // we would also map our Zod tools to Anthropic tool definitions here
        });

        if (message.content[0].type === 'text') {
            return message.content[0].text;
        }
        return "";
    }
}
