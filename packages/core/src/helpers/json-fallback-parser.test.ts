import test from "node:test";
import assert from "node:assert/strict";
import { parseJsonWithFallbacks } from "./json-fallback-parser.js";

test("parseJsonWithFallbacks parses direct JSON", () => {
    const result = parseJsonWithFallbacks('{"a":1}');
    assert.equal(result.success, true);
    assert.deepEqual(result.data, { a: 1 });
});

test("parseJsonWithFallbacks parses fenced JSON block", () => {
    const result = parseJsonWithFallbacks("hello\n```json\n{\"a\":2}\n```\nworld");
    assert.equal(result.success, true);
    assert.deepEqual(result.data, { a: 2 });
});

test("parseJsonWithFallbacks parses balanced object in text", () => {
    const result = parseJsonWithFallbacks("prefix {\"ok\":true,\"n\":3} suffix");
    assert.equal(result.success, true);
    assert.deepEqual(result.data, { ok: true, n: 3 });
});

test("parseJsonWithFallbacks returns error for invalid payload", () => {
    const result = parseJsonWithFallbacks("not-json");
    assert.equal(result.success, false);
    assert.match(result.error || "", /Failed to parse JSON/i);
});
