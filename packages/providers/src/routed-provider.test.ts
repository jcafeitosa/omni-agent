import test from "node:test";
import assert from "node:assert/strict";
import { AgentMessage, Provider, ProviderRegistry, ToolDefinition } from "@omni-agent/core";
import { ProviderModelManager } from "./model-manager.js";
import { ModelRouter } from "./routing.js";
import { RoutedProvider } from "./routed-provider.js";

class DummyProvider implements Provider {
    public name: string;
    private readonly model: string;
    private readonly shouldFail: boolean;

    constructor(name: string, model: string, shouldFail = false) {
        this.name = name;
        this.model = model;
        this.shouldFail = shouldFail;
    }

    async generateText(_messages: AgentMessage[], _tools?: ToolDefinition[]): Promise<any> {
        if (this.shouldFail) {
            throw new Error(`${this.name} failed`);
        }
        return { text: `${this.name}:${this.model}`, toolCalls: [] };
    }

    async embedText(_text: string): Promise<number[]> {
        return [1, 2, 3];
    }

    async embedBatch(_texts: string[]): Promise<number[][]> {
        return [[1, 2, 3]];
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

test("routed provider delegates generation to model router and stores route info", async () => {
    const registry = new ProviderRegistry();
    registry.register({
        name: "p1",
        create: () => new DummyProvider("p1", "p1-a", true),
        modelPatterns: [/^p1-/i]
    });
    registry.register({
        name: "p2",
        create: () => new DummyProvider("p2", "p2-a", false),
        modelPatterns: [/^p2-/i]
    });

    const manager = new ProviderModelManager({ registry, defaultCooldownMs: 10_000 });
    manager.availability.upsertModels("p1", ["p1-a"], "configured");
    manager.availability.upsertModels("p2", ["p2-a"], "configured");

    const router = new ModelRouter({ registry, modelManager: manager });
    const routed = new RoutedProvider({
        baseProvider: registry.create("p2"),
        router,
        requestDefaults: {
            providerPriority: ["p1", "p2"],
            allowProviderFallback: true,
            refreshBeforeRoute: false
        }
    });

    const response = await routed.generateText([{ role: "user", content: "hello" } as any]);
    assert.equal(response.text, "p2:p2-a");

    const last = routed.getLastRoute();
    assert.ok(last);
    assert.equal(last?.provider, "p2");
    assert.equal(last?.attempts.length, 2);
});

