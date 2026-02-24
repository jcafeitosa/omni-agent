import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultProviderRegistry } from "./registry.js";

test("default registry includes key providers", () => {
    const registry = createDefaultProviderRegistry();
    const names = registry.list().map((r) => r.name);
    assert.ok(names.includes("anthropic"));
    assert.ok(names.includes("openai"));
    assert.ok(names.includes("gemini"));
});

test("registry resolves provider name by model pattern", () => {
    const registry = createDefaultProviderRegistry();
    assert.equal(registry.resolveProviderNameForModel("claude-3-5-sonnet-20241022"), "anthropic");
    assert.equal(registry.resolveProviderNameForModel("gpt-4o"), "openai");
    assert.equal(registry.resolveProviderNameForModel("gemini-2.5-flash"), "gemini");
});

test("registry exposes capabilities for registered providers", () => {
    const registry = createDefaultProviderRegistry();
    const caps = registry.getCapabilities("anthropic");
    assert.ok(caps);
    assert.ok(caps?.features.includes("batch"));
});

