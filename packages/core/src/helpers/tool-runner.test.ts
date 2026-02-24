import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { AgentLoop } from "../loops/agent-loop.js";
import { AgentSession } from "../state/session.js";
import { ToolRunner } from "./tool-runner.js";
import type { Provider, ToolDefinition } from "../index.js";
import type { AgentMessage } from "../types/messages.js";

test("tool runner withResponse returns provider metadata", async () => {
    const provider: Provider = {
        name: "mock",
        async generateText(_messages: AgentMessage[]) {
            return {
                text: "ok",
                toolCalls: [],
                requestId: "req_meta_1",
                provider: "mock-provider",
                model: "mock-model",
                usage: { inputTokens: 2, outputTokens: 3 }
            };
        },
        async embedText() {
            return [];
        },
        async embedBatch() {
            return [];
        },
        getModelLimits(model?: string) {
            return {
                provider: "mock",
                model: model || "mock-model",
                contextWindowTokens: null,
                maxOutputTokens: null,
                maxInputTokens: null,
                source: "unknown" as const
            };
        }
    };

    const loop = new AgentLoop({
        session: new AgentSession({ systemPrompt: "test" }),
        provider,
        tools: new Map()
    });
    const runner = new ToolRunner(loop);
    const response = await runner.withResponse("hello");
    assert.equal(response.text, "ok");
    assert.equal(response.requestId, "req_meta_1");
    assert.equal(response.provider, "mock-provider");
    assert.equal(response.model, "mock-model");
    assert.deepEqual(response.usage, { inputTokens: 2, outputTokens: 3 });
});

test("tool runner enforces max_iterations", async () => {
    let callCount = 0;
    const provider: Provider = {
        name: "mock",
        async generateText(_messages: AgentMessage[]) {
            callCount++;
            if (callCount <= 3) {
                return {
                    text: "",
                    toolCalls: [{ id: `t${callCount}`, name: "echo", args: { value: `v${callCount}` } }]
                };
            }
            return { text: "done", toolCalls: [] };
        },
        async embedText() {
            return [];
        },
        async embedBatch() {
            return [];
        },
        getModelLimits(model?: string) {
            return {
                provider: "mock",
                model: model || "mock-model",
                contextWindowTokens: null,
                maxOutputTokens: null,
                maxInputTokens: null,
                source: "unknown" as const
            };
        }
    };

    const echoTool: ToolDefinition<{ value: string }> = {
        name: "echo",
        description: "echoes value",
        parameters: z.object({ value: z.string() }),
        async execute(args) {
            return args.value;
        }
    };

    const loop = new AgentLoop({
        session: new AgentSession({ systemPrompt: "test" }),
        provider,
        tools: new Map([["echo", echoTool]])
    });
    const runner = new ToolRunner(loop);

    await assert.rejects(
        () => runner.execute("go", { maxIterations: 1 }),
        /max_iterations=1/
    );
});
