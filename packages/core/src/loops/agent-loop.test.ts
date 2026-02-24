import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { AgentLoop } from "./agent-loop.js";
import { AgentSession } from "../state/session.js";
import { PermissionManager } from "../state/permissions.js";
import { EventLogStore } from "../state/event-log-store.js";
import type { Provider, ToolDefinition } from "../index.js";
import type { AgentMessage } from "../types/messages.js";

test("permission manager exposes suggestions on denied modes", async () => {
    const manager = new PermissionManager("plan");
    const decision = await manager.checkPermission("bash", {});
    assert.equal(decision.behavior, "deny");
    assert.equal((decision.suggestions || []).length > 0, true);
});

test("query supports promptSuggestion and emits task_notification events", async () => {
    let callCount = 0;
    const provider: Provider = {
        name: "mock",
        async generateText(_messages: AgentMessage[]) {
            callCount += 1;
            if (callCount === 1) {
                return {
                    text: "",
                    toolCalls: [{ id: "t1", name: "subagent", args: { taskId: "task-1" } }]
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

    const subagentTool: ToolDefinition<{ taskId?: string }> = {
        name: "subagent",
        description: "mock subagent",
        parameters: z.object({ taskId: z.string().optional() }),
        execute: async (args, context) => {
            context?.loop && (context.loop as any).emitTaskNotification({
                subtype: "task_started",
                task_id: args.taskId || "task-x",
                tool_use_id: context.toolUseId
            });
            return "started";
        }
    };

    const loop = new AgentLoop({
        session: new AgentSession({ systemPrompt: "test" }),
        provider,
        tools: new Map([["subagent", subagentTool]])
    });

    const stream = loop.runStream("start");
    const suggestions = await stream.promptSuggestion();
    assert.equal(Array.isArray(suggestions), true);
    assert.equal(suggestions.length > 0, true);

    let sawTaskNotification = false;
    for await (const event of stream) {
        if (event.type === "task_notification") {
            sawTaskNotification = true;
            assert.equal(event.task_id, "task-1");
            assert.equal(event.tool_use_id, "t1");
        }
        if (event.type === "result") break;
    }

    assert.equal(sawTaskNotification, true);
});

test("manual compact command reduces message history and inserts summary", async () => {
    const provider: Provider = {
        name: "mock",
        async generateText() {
            return { text: "ok", toolCalls: [] };
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

    const session = new AgentSession({ systemPrompt: "test" });
    for (let i = 0; i < 20; i++) {
        session.addMessage({ role: "user", content: `very long input ${"x".repeat(180)}` });
        session.addMessage({ role: "assistant", content: `very long output ${"y".repeat(180)}` });
    }
    const before = session.getMessages().length;

    const loop = new AgentLoop({
        session,
        provider,
        tools: new Map(),
        compactionControl: { enabled: true, contextTokenThreshold: 300, targetRatio: 0.5 }
    });

    const command = loop.runStream("/compact");
    for await (const event of command) {
        if (event.type === "result") break;
    }

    const after = session.getMessages().length;
    assert.equal(after < before, true);
    const hasSummary = session
        .getMessages()
        .some((m) => typeof m.content === "string" && m.content.includes("Compaction summary"));
    assert.equal(hasSummary, true);
});

test("auto compaction triggers before model call when threshold is exceeded", async () => {
    const session = new AgentSession({ systemPrompt: "test" });
    for (let i = 0; i < 24; i++) {
        session.addMessage({ role: "user", content: `input ${"x".repeat(220)}` });
        session.addMessage({ role: "assistant", content: `output ${"y".repeat(220)}` });
    }

    const provider: Provider = {
        name: "mock",
        async generateText(_messages) {
            const hasSummary = _messages.some(
                (m) => typeof m.content === "string" && String(m.content).includes("Compaction summary")
            );
            assert.equal(hasSummary, true);
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

    const loop = new AgentLoop({
        session,
        provider,
        tools: new Map(),
        compactionControl: { enabled: true, contextTokenThreshold: 400, targetRatio: 0.6 }
    });

    const result = await loop.run("go");
    assert.equal(result, "done");
});

test("provider response metadata is propagated to stream events", async () => {
    const session = new AgentSession({ systemPrompt: "test" });

    const provider: Provider = {
        name: "mock",
        async generateText() {
            return {
                text: "done",
                toolCalls: [],
                requestId: "req_123",
                provider: "mock-provider",
                model: "mock-model-v2",
                usage: {
                    inputTokens: 10,
                    outputTokens: 4
                }
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
        session,
        provider,
        tools: new Map()
    });

    const query = loop.runStream("go");
    let sawText = false;
    let sawResult = false;
    for await (const event of query) {
        if (event.type === "text") {
            sawText = true;
            assert.equal(event.request_id, "req_123");
            assert.equal(event.provider, "mock-provider");
            assert.equal(event.model, "mock-model-v2");
        }
        if (event.type === "result") {
            sawResult = true;
            assert.equal(event.request_id, "req_123");
            assert.equal(event.provider, "mock-provider");
            assert.equal(event.model, "mock-model-v2");
            assert.deepEqual(event.usage, { inputTokens: 10, outputTokens: 4 });
            break;
        }
    }

    assert.equal(sawText, true);
    assert.equal(sawResult, true);
});

test("agent loop parses structured output when configured", async () => {
    const session = new AgentSession({ systemPrompt: "test" });

    const provider: Provider = {
        name: "mock",
        async generateText() {
            return {
                text: '```json\n{"title":"ok","score":7}\n```',
                toolCalls: []
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
        session,
        provider,
        tools: new Map(),
        structuredOutput: {
            schema: z.object({
                title: z.string(),
                score: z.number()
            })
        }
    });

    const query = loop.runStream("go");
    for await (const event of query) {
        if (event.type === "result") {
            assert.equal(event.subtype, "success");
            assert.deepEqual(event.structured, { title: "ok", score: 7 });
            break;
        }
    }
});

test("agent loop returns structured validation error when configured as strict", async () => {
    const session = new AgentSession({ systemPrompt: "test" });

    const provider: Provider = {
        name: "mock",
        async generateText() {
            return {
                text: '{"title":"ok","score":"not-a-number"}',
                toolCalls: []
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
        session,
        provider,
        tools: new Map(),
        structuredOutput: {
            schema: z.object({
                title: z.string(),
                score: z.number()
            }),
            failOnValidationError: true
        }
    });

    const query = loop.runStream("go");
    for await (const event of query) {
        if (event.type === "result") {
            assert.equal(event.subtype, "error");
            assert.match(event.result, /Structured output validation failed/i);
            break;
        }
    }
});

test("agent loop can use provider native tool runner mode", async () => {
    let nativeCalls = 0;
    const provider: Provider = {
        name: "mock",
        async generateText() {
            return { text: "fallback", toolCalls: [] };
        },
        async runToolsNative() {
            nativeCalls += 1;
            return { text: "native", toolCalls: [] };
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
        tools: new Map(),
        toolRunnerMode: "provider_native"
    });

    const result = await loop.run("go");
    assert.equal(result, "native");
    assert.equal(nativeCalls, 1);
});

test("agent loop emits typed request_user_input and plan_update events", async () => {
    let callCount = 0;
    const provider: Provider = {
        name: "mock",
        async generateText() {
            callCount++;
            if (callCount === 1) {
                return { text: "", toolCalls: [{ id: "t1", name: "meta", args: {} }] };
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

    const tool: ToolDefinition<{}> = {
        name: "meta",
        description: "emit events",
        parameters: z.object({}),
        execute: async (_args, context) => {
            const loop = context?.loop as any;
            loop.emitRequestUserInput({
                call_id: context?.toolUseId || "x",
                turn_id: "turn-1",
                questions: [{ id: "q1", header: "h", question: "q?" }]
            });
            loop.emitPlanUpdate({
                explanation: "progress",
                plan: [{ step: "do x", status: "in_progress" }]
            });
            return "ok";
        }
    };

    const loop = new AgentLoop({
        session: new AgentSession({ systemPrompt: "test" }),
        provider,
        tools: new Map([["meta", tool]])
    });

    let sawRequest = false;
    let sawPlan = false;
    for await (const event of loop.runStream("go")) {
        if (event.type === "request_user_input") {
            sawRequest = true;
            assert.equal(event.payload.questions.length, 1);
        }
        if (event.type === "plan_update") {
            sawPlan = true;
            assert.equal(event.payload.plan.length, 1);
        }
        if (event.type === "result") break;
    }

    assert.equal(sawRequest, true);
    assert.equal(sawPlan, true);
});

test("agent loop ignores invalid request_user_input and plan_update payloads", async () => {
    let callCount = 0;
    const provider: Provider = {
        name: "mock",
        async generateText() {
            callCount++;
            if (callCount === 1) {
                return { text: "", toolCalls: [{ id: "t1", name: "meta_invalid", args: {} }] };
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

    const tool: ToolDefinition<{}> = {
        name: "meta_invalid",
        description: "emit invalid events",
        parameters: z.object({}),
        execute: async (_args, context) => {
            const loop = context?.loop as any;
            loop.emitRequestUserInput({
                call_id: "",
                questions: []
            });
            loop.emitPlanUpdate({
                plan: [{ step: "", status: "pending" }]
            });
            return "ok";
        }
    };

    const loop = new AgentLoop({
        session: new AgentSession({ systemPrompt: "test" }),
        provider,
        tools: new Map([["meta_invalid", tool]])
    });

    let requestCount = 0;
    let planCount = 0;
    for await (const event of loop.runStream("go")) {
        if (event.type === "request_user_input") requestCount++;
        if (event.type === "plan_update") planCount++;
        if (event.type === "result") break;
    }

    assert.equal(requestCount, 0);
    assert.equal(planCount, 0);
});

test("agent loop persists events using event log store", async () => {
    const dir = await mkdtemp(join(tmpdir(), "omni-agent-loop-log-"));
    try {
        const filePath = join(dir, "events.log");
        const eventLogStore = new EventLogStore({
            filePath,
            batchSize: 100,
            flushIntervalMs: 10_000
        });
        const provider: Provider = {
            name: "mock",
            async generateText() {
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

        const loop = new AgentLoop({
            session: new AgentSession({ systemPrompt: "test" }),
            provider,
            tools: new Map(),
            eventLogStore
        });

        const result = await loop.run("go");
        assert.equal(result, "done");
        const content = await readFile(filePath, "utf8");
        assert.equal(content.includes('"type":"turn_started"'), true);
        assert.equal(content.includes('"type":"assistant_text"'), true);
        assert.equal(content.includes('"type":"turn_completed"'), true);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
