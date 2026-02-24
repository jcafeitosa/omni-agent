import test from "node:test";
import assert from "node:assert/strict";
import { compactMessages } from "./compaction.js";
import type { AgentMessage } from "../types/messages.js";

test("compaction supports advanced message parts without crashing", () => {
    const messages: AgentMessage[] = [
        {
            role: "user",
            content: [
                { type: "text", text: "hello" },
                {
                    type: "document",
                    document: {
                        sourceType: "text",
                        text: "policy content",
                        name: "POLICY.md"
                    }
                },
                {
                    type: "citation",
                    citation: {
                        text: "quoted content",
                        source: "POLICY.md"
                    }
                },
                {
                    type: "code_execution",
                    language: "ts",
                    code: "console.log('ok')",
                    stdout: "ok",
                    exitCode: 0
                }
            ]
        },
        { role: "assistant", content: "done" }
    ];

    const result = compactMessages(messages, {
        maxTokens: 10,
        targetRatio: 0.5,
        injectSummary: true
    });

    assert.equal(result.compactedMessages.length > 0, true);
    assert.equal(result.newTokenCount >= 0, true);
});
