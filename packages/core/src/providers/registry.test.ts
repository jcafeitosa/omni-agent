import test from "node:test";
import assert from "node:assert/strict";
import { ProviderRegistry } from "./registry.js";

test("provider registry supports unregister and source-based cleanup", () => {
    const registry = new ProviderRegistry();

    registry.register(
        {
            name: "p1",
            create: () => ({
                name: "p1",
                generateText: async () => ({ text: "ok", toolCalls: [] }),
                embedText: async () => [],
                embedBatch: async () => [],
                getModelLimits: () => ({
                    provider: "p1",
                    model: "m1",
                    contextWindowTokens: null,
                    maxOutputTokens: null,
                    maxInputTokens: null,
                    source: "unknown"
                })
            }) as any
        },
        "ext-a"
    );

    registry.register(
        {
            name: "p2",
            create: () => ({
                name: "p2",
                generateText: async () => ({ text: "ok", toolCalls: [] }),
                embedText: async () => [],
                embedBatch: async () => [],
                getModelLimits: () => ({
                    provider: "p2",
                    model: "m2",
                    contextWindowTokens: null,
                    maxOutputTokens: null,
                    maxInputTokens: null,
                    source: "unknown"
                })
            }) as any
        },
        "ext-a"
    );

    registry.register({
        name: "p3",
        sourceId: "ext-b",
        create: () => ({
            name: "p3",
            generateText: async () => ({ text: "ok", toolCalls: [] }),
            embedText: async () => [],
            embedBatch: async () => [],
            getModelLimits: () => ({
                provider: "p3",
                model: "m3",
                contextWindowTokens: null,
                maxOutputTokens: null,
                maxInputTokens: null,
                source: "unknown"
            })
        }) as any
    });

    assert.equal(registry.has("p1"), true);
    assert.equal(registry.unregister("p1"), true);
    assert.equal(registry.has("p1"), false);

    const removed = registry.unregisterBySource("ext-a");
    assert.equal(removed, 1);
    assert.equal(registry.has("p2"), false);
    assert.equal(registry.has("p3"), true);

    registry.clear();
    assert.equal(registry.list().length, 0);
});
