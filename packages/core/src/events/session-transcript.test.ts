import test from "node:test";
import assert from "node:assert/strict";
import { transcriptFromEvents, transcriptFromMessages, transcriptToMarkdown } from "./session-transcript.js";
import type { AgentMessage } from "../types/messages.js";
import type { EventLogEntry } from "../state/event-log-store.js";

test("transcriptFromMessages includes tool call and tool result entries", () => {
    const messages: AgentMessage[] = [
        {
            role: "assistant",
            content: "ok",
            toolCalls: [{ id: "t1", name: "read_file", args: { path: "a.ts" } }]
        },
        {
            role: "toolResult",
            content: "file content",
            toolCallId: "t1",
            toolName: "read_file"
        }
    ];

    const transcript = transcriptFromMessages(messages);
    assert.equal(transcript.length, 3);
    assert.equal(transcript[1].kind, "tool_use");
    assert.equal(transcript[2].kind, "message");
});

test("transcriptFromEvents and markdown export keeps key event data", () => {
    const events: EventLogEntry[] = [
        { ts: 1, type: "assistant_text", payload: { provider: "p", model: "m" } },
        { ts: 2, type: "tool_use", payload: { tool: "grep", tool_use_id: "u1" } },
        { ts: 3, type: "tool_result", payload: { tool: "grep", tool_use_id: "u1", status: "success" } },
        { ts: 4, type: "turn_completed", payload: { status: "success", provider: "p", model: "m" } }
    ];

    const transcript = transcriptFromEvents(events);
    assert.equal(transcript.length, 4);
    const markdown = transcriptToMarkdown(transcript);
    assert.match(markdown, /\[tool_use\] grep id=u1/);
    assert.match(markdown, /\[turn\] status=success provider=p model=m/);
});

