import test from "node:test";
import assert from "node:assert/strict";
import { listModelCatalog, resolveModelLimits } from "./model-limits.js";

test("resolveModelLimits returns catalog limits for known OpenAI model", () => {
    const limits = resolveModelLimits("openai", "gpt-4o");
    assert.equal(limits.source, "catalog");
    assert.equal(limits.contextWindowTokens, 128000);
    assert.equal(limits.maxOutputTokens, 16384);
    assert.equal(limits.maxInputTokens, 111616);
});

test("resolveModelLimits uses configured max output when provided", () => {
    const limits = resolveModelLimits("anthropic", "claude-3-5-sonnet-20241022", 4096);
    assert.equal(limits.source, "configured");
    assert.equal(limits.maxOutputTokens, 4096);
    assert.equal(limits.maxInputTokens, 195904);
});

test("resolveModelLimits returns unknown for unmapped model", () => {
    const limits = resolveModelLimits("custom-provider", "my-model");
    assert.equal(limits.source, "unknown");
    assert.equal(limits.contextWindowTokens, null);
    assert.equal(limits.maxOutputTokens, null);
});

test("resolveModelLimits maps openai-compatible providers to OpenAI catalog", () => {
    const limits = resolveModelLimits("openrouter", "gpt-4o");
    assert.equal(limits.source, "catalog");
    assert.equal(limits.contextWindowTokens, 128000);
});

test("resolveModelLimits includes classification payload", () => {
    const limits = resolveModelLimits("gemini", "gemini-2.5-flash");
    assert.equal(limits.classification?.supportsToolCalling, true);
    assert.equal(limits.classification?.tier, "fast");
    assert.equal(limits.classification?.supportsEffort, true);
    assert.equal(limits.classification?.supportsAdaptiveThinking, true);
});

test("listModelCatalog returns entries and supports provider filter", () => {
    const all = listModelCatalog();
    assert.ok(all.length > 0);

    const openaiOnly = listModelCatalog("openai");
    assert.ok(openaiOnly.length > 0);
    assert.ok(openaiOnly.every((entry) => entry.provider === "openai"));
});
