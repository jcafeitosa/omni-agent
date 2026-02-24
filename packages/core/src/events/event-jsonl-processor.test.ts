import test from "node:test";
import assert from "node:assert/strict";
import { EventJsonlProcessor } from "./event-jsonl-processor.js";

test("event jsonl processor parses, filters and summarizes events", () => {
    const content = [
        JSON.stringify({ ts: 100, type: "turn_started", payload: {} }),
        JSON.stringify({ ts: 110, type: "tool_result", subtype: "ok", payload: {} }),
        JSON.stringify({ ts: 120, type: "tool_result", subtype: "error", payload: {} }),
        "{bad json}",
        ""
    ].join("\n");

    const events = EventJsonlProcessor.parse(content);
    assert.equal(events.length, 3);

    const onlyToolResult = EventJsonlProcessor.filter(events, { type: "tool_result" });
    assert.equal(onlyToolResult.length, 2);

    const summary = EventJsonlProcessor.summarize(events);
    assert.equal(summary.total, 3);
    assert.equal(summary.byType.turn_started, 1);
    assert.equal(summary.byType.tool_result, 2);
    assert.equal(summary.bySubtype.ok, 1);
    assert.equal(summary.bySubtype.error, 1);
    assert.equal(summary.minTs, 100);
    assert.equal(summary.maxTs, 120);
});
