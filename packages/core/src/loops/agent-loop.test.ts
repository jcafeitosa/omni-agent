import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { AgentLoop } from "./agent-loop.js";
import { AgentSession } from "../state/session.js";
import { PermissionManager } from "../state/permissions.js";
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

