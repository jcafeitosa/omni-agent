import test from "node:test";
import assert from "node:assert/strict";
import { parsePlanUpdatePayload, parseRequestUserInputPayload } from "./protocol-events.js";

test("parseRequestUserInputPayload validates required fields", () => {
    const ok = parseRequestUserInputPayload({
        call_id: "call-1",
        questions: [{ id: "q1", header: "mode", question: "choose mode" }]
    });
    assert.equal(ok !== null, true);

    const bad = parseRequestUserInputPayload({
        call_id: "",
        questions: []
    });
    assert.equal(bad, null);
});

test("parsePlanUpdatePayload validates step status", () => {
    const ok = parsePlanUpdatePayload({
        explanation: "running",
        plan: [{ step: "index files", status: "in_progress" }]
    });
    assert.equal(ok !== null, true);

    const bad = parsePlanUpdatePayload({
        plan: [{ step: "index files", status: "doing" }]
    });
    assert.equal(bad, null);
});
