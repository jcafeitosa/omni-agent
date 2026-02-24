import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMistralToolCallId, resolveProviderCompatProfile } from "./provider-compat.js";

test("resolveProviderCompatProfile returns provider-specific overrides", () => {
    const mistral = resolveProviderCompatProfile("mistral", "https://api.mistral.ai/v1");
    assert.equal(mistral.requiresMistralToolIds, true);

    const openrouter = resolveProviderCompatProfile("custom", "https://openrouter.ai/api/v1");
    assert.equal(openrouter.maxTokensField, "max_completion_tokens");

    const defaultProfile = resolveProviderCompatProfile("openai");
    assert.equal(defaultProfile.supportsUsageInStreaming, true);
});

test("normalizeMistralToolCallId enforces 9 alphanumeric chars", () => {
    assert.equal(normalizeMistralToolCallId("tool-call-12345"), "toolcall1");
    assert.equal(normalizeMistralToolCallId("a"), "aABCDEFGH");
    assert.equal(normalizeMistralToolCallId("ABCDEFGHIJK"), "ABCDEFGHI");
});
