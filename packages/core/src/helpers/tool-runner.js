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
    async execute(input) {
        let finalResponse = "";
        for await (const event of this.agentLoop.runStream(input)) {
            switch (event.type) {
                case 'text':
                    if (this.onTextCallback)
                        this.onTextCallback(event.text);
                    break;
                case 'toolCall':
                    if (this.onToolCallCallback)
                        this.onToolCallCallback(event.tool, event.args);
                    break;
                case 'toolResult':
                    if (this.onToolResultCallback)
                        this.onToolResultCallback(event.tool, event.result);
                    break;
                case 'finalMessage':
                    finalResponse = event.text;
                    if (this.onFinalMessageCallback)
                        this.onFinalMessageCallback(event.text);
                    break;
            }
        }
        return finalResponse;
    }
}
