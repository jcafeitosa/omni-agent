import test from "node:test";
import assert from "node:assert/strict";
import { transformMessagesForProvider } from "./message-transformer.js";

test("message transformer remaps tool call ids and tool results", () => {
    const transformed = transformMessagesForProvider(
        [
            {
                role: "assistant",
                content: "",
                toolCalls: [{ id: "tool-call-12345", name: "read", args: { path: "a" } }]
            } as any,
            {
                role: "toolResult",
                toolCallId: "tool-call-12345",
                text: "ok",
                content: "ok"
            } as any
        ],
        {
            normalizeToolCallId: (id) => id.replace(/-/g, "")
        }
    );

    const assistant = transformed[0] as any;
    const toolResult = transformed[1] as any;
    assert.equal(assistant.toolCalls[0].id, "toolcall12345");
    assert.equal(toolResult.toolCallId, "toolcall12345");
});

test("message transformer injects synthetic tool results for orphan tool calls", () => {
    const transformed = transformMessagesForProvider([
        {
            role: "assistant",
            content: "",
            toolCalls: [{ id: "c1", name: "write", args: {} }]
        } as any,
        {
            role: "user",
            content: "continue",
            text: "continue"
        } as any
    ]);

    assert.equal(transformed.length, 3);
    const synthetic = transformed[1] as any;
    assert.equal(synthetic.role, "toolResult");
    assert.equal(synthetic.toolCallId, "c1");
    assert.equal(synthetic.isError, true);
});
