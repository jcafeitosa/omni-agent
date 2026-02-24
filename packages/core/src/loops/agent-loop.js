/**
 * State Machine for the OmniAgent loop.
 * Inspired by Claude SDK's discrete turn processing.
 */
export class AgentLoop {
    session;
    provider;
    tools;
    hookManager;
    maxTurns;
    constructor(options) {
        this.session = options.session;
        this.provider = options.provider;
        this.tools = options.tools;
        this.hookManager = options.hookManager;
        this.maxTurns = options.maxTurns || 15;
    }
    /**
     * Executes the agent loop synchronously (blocking until final text)
     */
    async run(input) {
        let finalResponse = "";
        for await (const event of this.runStream(input)) {
            if (event.type === 'finalMessage') {
                finalResponse = event.text;
            }
        }
        return finalResponse;
    }
    /**
     * Executes the agent loop returning an async generator of StreamEvents.
     * Mimics Anthropic SDK's `MessageStream` enabling UI rendering chunk-by-chunk.
     */
    async *runStream(input) {
        this.session.addMessage({ role: "user", text: input, content: input });
        let turnCount = 0;
        while (turnCount < this.maxTurns) {
            turnCount++;
            const { steering, followUp } = this.session.consumeQueues();
            // Inject steering mid-run if any
            if (steering.length > 0) {
                this.session.addMessage({ role: "user", text: steering.join("\n"), content: steering.join("\n") });
            }
            this.session.eventBus.emit("turnStart", { turnNumber: turnCount });
            // Build context
            const prompt = this.buildPromptContext();
            // Call LLM Provider
            const responseText = await this.provider.generateText(prompt);
            const parsedContent = this.parseResponse(responseText);
            this.session.addMessage({ role: "assistant", text: parsedContent.text, content: parsedContent.text, toolCalls: parsedContent.toolCalls });
            // Stream Text chunk if exists
            if (parsedContent.text) {
                yield { type: 'text', text: parsedContent.text };
            }
            if (parsedContent.toolCalls.length === 0) {
                // Run followUps if agent finished
                if (followUp.length > 0) {
                    this.session.addMessage({ role: "user", text: followUp.join("\n"), content: followUp.join("\n") });
                    continue;
                }
                yield { type: 'finalMessage', text: parsedContent.text };
                return;
            }
            // Execute Tools sequentially (Claude style tracking)
            for (const call of parsedContent.toolCalls) {
                yield { type: 'toolCall', tool: call.name, args: call.args };
                const tool = this.tools.get(call.name);
                if (!tool) {
                    const errRes = `Error: Tool not found ${call.name}`;
                    this.session.addMessage({ role: "toolResult", text: errRes, content: "" });
                    yield { type: 'toolResult', tool: call.name, result: errRes };
                    continue;
                }
                try {
                    // PreToolUse Hook (Claude Code style interceptor)
                    let argsToUse = call.args;
                    if (this.hookManager) {
                        const preHookRes = await this.hookManager.emit("PreToolUse", { tool: call.name, args: call.args });
                        if (preHookRes.block) {
                            const blockRes = `Tool blocked by PreToolUse hook: ${preHookRes.reason}`;
                            this.session.addMessage({ role: "toolResult", text: blockRes, content: "" });
                            yield { type: 'toolResult', tool: call.name, result: blockRes };
                            continue;
                        }
                        if (preHookRes.args) {
                            argsToUse = preHookRes.args;
                        }
                    }
                    const result = await tool.execute(argsToUse);
                    // PostToolUse Hook
                    let finalResult = result;
                    if (this.hookManager) {
                        const postHookRes = await this.hookManager.emit("PostToolUse", { tool: call.name, result });
                        if (postHookRes.result) {
                            finalResult = postHookRes.result;
                        }
                    }
                    this.session.addMessage({ role: "toolResult", text: finalResult, content: finalResult });
                    yield { type: 'toolResult', tool: call.name, result: finalResult };
                }
                catch (error) {
                    if (error.name === "ToolError" && error.content) {
                        const errChunks = JSON.stringify(error.content);
                        this.session.addMessage({ role: "toolResult", text: `Tool Error with blocks: ${errChunks}`, content: errChunks });
                        yield { type: 'toolResult', tool: call.name, result: errChunks };
                    }
                    else {
                        const errRes = `Tool Error execution: ${error.message}`;
                        this.session.addMessage({ role: "toolResult", text: errRes, content: "" });
                        yield { type: 'toolResult', tool: call.name, result: errRes };
                    }
                }
            }
        }
        throw new Error("Max turns reached without finalizing response.");
    }
    buildPromptContext() {
        const sys = `<system>\n${this.session.getSystemPrompt()}\n</system>`;
        // Normally this builds the exact format depending on Provider.
        // For now we aggregate to a linear log.
        const history = this.session.getMessages().map(m => {
            let msg = `[${m.role.toUpperCase()}]: ${m.text}`;
            if (m.toolCalls && m.toolCalls.length > 0) {
                msg += `\nTools requested: ${m.toolCalls.map(tc => tc.name).join(", ")}`;
            }
            return msg;
        }).join("\n---\n");
        return `${sys}\n\n${history}`;
    }
    /**
     * Dummy parser. In production this parses strict JSON blobs or XML tool blocks
     * from Provider text streams.
     */
    parseResponse(text) {
        return { text, toolCalls: [] };
    }
}
