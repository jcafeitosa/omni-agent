import test from "node:test";
import assert from "node:assert/strict";
import { normalizeToolCall, parseJsonObjectArgs } from "./tool-call-normalizer.js";

test("parseJsonObjectArgs returns empty object on invalid JSON", () => {
    assert.deepEqual(parseJsonObjectArgs("{invalid"), {});
});

test("parseJsonObjectArgs returns object for valid JSON object", () => {
    assert.deepEqual(parseJsonObjectArgs('{"a":1}'), { a: 1 });
});

test("parseJsonObjectArgs returns empty object for non-object JSON", () => {
    assert.deepEqual(parseJsonObjectArgs("[]"), {});
    assert.deepEqual(parseJsonObjectArgs('"str"'), {});
});

test("normalizeToolCall fills defaults and normalizes args", () => {
    const normalized = normalizeToolCall({
        name: "read_file",
        args: "not-an-object"
    });

    assert.equal(normalized.name, "read_file");
    assert.equal(typeof normalized.id, "string");
    assert.ok(normalized.id.length > 0);
    assert.deepEqual(normalized.args, {});
});

