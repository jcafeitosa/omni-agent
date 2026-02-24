import { AgentLoop } from "../loops/agent-loop.js";
import { SDKEvent } from "../types/messages.js";

/**
 * A wrapper mimicking Anthropic's auto-run mechanism `ToolRunner` / `.runTools()`.
 * It provides an Event Emitter-like chain on top of an Async Generator mapping.
 */
export class ToolRunner {
    private agentLoop: AgentLoop;
    private onTextCallback?: (text: string) => void;
    private onToolCallCallback?: (tool: string, args: any) => void;
    private onToolResultCallback?: (tool: string, result: string) => void;
    private onFinalMessageCallback?: (text: string) => void;

    constructor(agentLoop: AgentLoop) {
        this.agentLoop = agentLoop;
    }

    onText(callback: (text: string) => void): this {
        this.onTextCallback = callback;
        return this;
    }

    onToolCall(callback: (tool: string, args: any) => void): this {
        this.onToolCallCallback = callback;
        return this;
    }

    onToolResult(callback: (tool: string, result: string) => void): this {
        this.onToolResultCallback = callback;
        return this;
    }

    onFinalMessage(callback: (text: string) => void): this {
        this.onFinalMessageCallback = callback;
        return this;
    }

    async execute(input: string): Promise<string> {
        let finalResponse = "";

        for await (const event of this.agentLoop.runStream(input)) {
            switch (event.type) {
                case 'text':
                    if (this.onTextCallback) this.onTextCallback(event.text);
                    break;
                case 'tool_use':
                    if (this.onToolCallCallback) this.onToolCallCallback(event.tool, event.input);
                    break;
                case 'tool_result':
                    if (this.onToolResultCallback) this.onToolResultCallback(event.tool, event.result);
                    break;
                case 'result':
                    if (event.subtype === 'success') {
                        finalResponse = event.result;
                        if (this.onFinalMessageCallback) this.onFinalMessageCallback(event.result);
                    }
                    break;
            }
        }

        return finalResponse;
    }
}
