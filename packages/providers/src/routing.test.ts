import test from "node:test";
import assert from "node:assert/strict";
import { AgentMessage, Provider, ProviderRegistry, ToolDefinition } from "@omni-agent/core";
import { ProviderModelManager } from "./model-manager.js";
import { ModelRouter } from "./routing.js";

class MockProvider implements Provider {
    public name: string;
    private readonly model: string;
    private readonly failModels: Set<string>;

    constructor(name: string, model: string, failModels: string[] = []) {
        this.name = name;
        this.model = model;
        this.failModels = new Set(failModels);
    }

    async generateText(_messages: AgentMessage[], _tools?: ToolDefinition[]): Promise<any> {
        if (this.failModels.has(this.model)) {
            throw new Error(`forced failure for ${this.name}/${this.model}`);
        }
        return { text: `${this.name}:${this.model}`, toolCalls: [] };
    }

    async embedText(_text: string): Promise<number[]> {
        return [];
    }

    async embedBatch(_texts: string[]): Promise<number[][]> {
        return [];
    }

    getModelLimits(model?: string): any {
        return {
            provider: this.name,
            model: model || this.model,
            contextWindowTokens: null,
            maxOutputTokens: null,
            maxInputTokens: null,
            source: "configured"
        };
    }
}

function createMockRegistry(): ProviderRegistry {
    const registry = new ProviderRegistry();

    registry.register({
        name: "p1",
        modelPatterns: [/^p1-/i],
        create: (opts?: any) => new MockProvider("p1", opts?.model || "p1-a", ["p1-a"])
    });

    registry.register({
        name: "p2",
        modelPatterns: [/^p2-/i],
        create: (opts?: any) => new MockProvider("p2", opts?.model || "p2-a")
    });

    return registry;
}

test("router falls back to next provider when first provider fails", async () => {
    const registry = createMockRegistry();
    const manager = new ProviderModelManager({ registry, defaultCooldownMs: 5_000 });
    manager.availability.upsertModels("p1", ["p1-a"], "configured");
    manager.availability.upsertModels("p2", ["p2-a"], "configured");

    const router = new ModelRouter({ registry, modelManager: manager });
    const result = await router.generateText([], {
        providerPriority: ["p1", "p2"],
        allowProviderFallback: true,
        refreshBeforeRoute: false
    });

    assert.equal(result.provider, "p2");
    assert.equal(result.model, "p2-a");
    assert.equal(manager.availability.isOnCooldown("p1", "p1-a"), true);
    assert.equal(result.attempts.length, 2);
});

test("router falls back to another model in same provider when preferred is on cooldown", async () => {
    const registry = new ProviderRegistry();
    registry.register({
        name: "p1",
        create: (opts?: any) => new MockProvider("p1", opts?.model || "p1-a", ["p1-a"]),
        modelPatterns: [/^p1-/i]
    });

    const manager = new ProviderModelManager({ registry, defaultCooldownMs: 60_000 });
    manager.availability.upsertModels("p1", ["p1-a", "p1-b"], "configured");
    manager.markModelFailure("p1", "p1-a", new Error("forced"), 60_000);

    const router = new ModelRouter({ registry, modelManager: manager });
    const result = await router.generateText([], {
        provider: "p1",
        model: "p1-a",
        allowProviderFallback: false,
        refreshBeforeRoute: false
    });

    assert.equal(result.provider, "p1");
    assert.equal(result.model, "p1-b");
    assert.equal(result.response.text, "p1:p1-b");
});
