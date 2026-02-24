/**
 * A wrapper mimicking Anthropic's auto-run mechanism `ToolRunner` / `.runTools()`.
 * It provides an Event Emitter-like chain on top of an Async Generator mapping.
 */
export class ToolRunner {
    agentLoop;
    onTextCallback;
    onToolCallCallback;
    onToolResultCallback;
    onFinalMessageCallback;
    constructor(agentLoop) {
        this.agentLoop = agentLoop;
    }
    onText(callback) {
        this.onTextCallback = callback;
        return this;
    }
    onToolCall(callback) {
        this.onToolCallCallback = callback;
        return this;
    }
    onToolResult(callback) {
        this.onToolResultCallback = callback;
        return this;
    }
    onFinalMessage(callback) {
        this.onFinalMessageCallback = callback;
        return this;
    }
    async execute(input, options = {}) {
        const response = await this.withResponse(input, options);
        return response.text;
    }
    async withResponse(input, options = {}) {
        const maxIterations = options.maxIterations ?? Infinity;
        let toolCalls = 0;
        const stream = this.agentLoop.runStream(input);
        const abortHandler = () => {
            stream.interrupt();
        };
        if (options.signal) {
            if (options.signal.aborted) {
                stream.interrupt();
            }
            else {
                options.signal.addEventListener("abort", abortHandler, { once: true });
            }
        }
        let finalResponse = "";
        let finalMeta = {};
        try {
            for await (const event of stream) {
                switch (event.type) {
                    case "text":
                        if (this.onTextCallback)
                            this.onTextCallback(event.text);
                        break;
                    case "tool_use":
                        toolCalls++;
                        if (toolCalls > maxIterations) {
                            stream.interrupt();
                            throw new Error(`Tool runner exceeded max_iterations=${maxIterations}`);
                        }
                        if (this.onToolCallCallback)
                            this.onToolCallCallback(event.tool, event.input);
                        break;
                    case "tool_result":
                        if (this.onToolResultCallback)
                            this.onToolResultCallback(event.tool, event.result);
                        break;
                    case "result":
                        if (event.subtype === "success") {
                            finalResponse = event.result;
                            finalMeta = {
                                requestId: event.request_id,
                                provider: event.provider,
                                model: event.model,
                                usage: event.usage
                            };
                            if (this.onFinalMessageCallback)
                                this.onFinalMessageCallback(event.result);
                        }
                        break;
                }
            }
        }
        finally {
            options.signal?.removeEventListener("abort", abortHandler);
        }
        return {
            text: finalResponse,
            ...finalMeta
        };
    }
}
