import test from "node:test";
import assert from "node:assert/strict";
import { AgentMessage, OAuthCredentialStore, OAuthCredentials, OAuthManager, OAuthProviderProfile, Provider, ProviderRegistry, ToolDefinition } from "@omni-agent/core";
import { ProviderModelManager } from "./model-manager.js";
import { ModelRouter } from "./routing.js";

class MockProvider implements Provider {
    public name: string;
    private readonly model: string;
    private readonly failModels: Set<string>;
    private customGenerate?: (messages: AgentMessage[], tools?: ToolDefinition[]) => Promise<any>;

    constructor(name: string, model: string, failModels: string[] = []) {
        this.name = name;
        this.model = model;
        this.failModels = new Set(failModels);
    }

    async generateText(_messages: AgentMessage[], _tools?: ToolDefinition[]): Promise<any> {
        if (this.customGenerate) {
            return this.customGenerate(_messages, _tools);
        }
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

    withGenerate(fn: (messages: AgentMessage[], tools?: ToolDefinition[]) => Promise<any>): this {
        this.customGenerate = fn;
        return this;
    }
}

class InMemoryOAuthStore implements OAuthCredentialStore {
    private data = new Map<string, OAuthCredentials>();
    async load(providerId: string): Promise<OAuthCredentials | null> {
        return this.data.get(providerId) || null;
    }
    async save(providerId: string, credentials: OAuthCredentials): Promise<void> {
        this.data.set(providerId, credentials);
    }
    async delete(providerId: string): Promise<boolean> {
        return this.data.delete(providerId);
    }
    async listProviderIds(): Promise<string[]> {
        return Array.from(this.data.keys());
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

test("router prioritizes oauth providers first when no explicit provider is set", async () => {
    const registry = new ProviderRegistry();
    registry.register({
        name: "anthropic",
        create: (opts?: any) => new MockProvider("anthropic", opts?.model || "claude-3-5-sonnet-20241022"),
        modelPatterns: [/^claude-/i]
    });
    registry.register({
        name: "mistral",
        create: (opts?: any) => new MockProvider("mistral", opts?.model || "mistral-small"),
        modelPatterns: [/^mistral-/i]
    });

    const manager = new ProviderModelManager({ registry, defaultCooldownMs: 10_000 });
    manager.availability.upsertModels("anthropic", ["claude-3-5-sonnet-20241022"], "configured");
    manager.availability.upsertModels("mistral", ["mistral-small"], "configured");

    const router = new ModelRouter({ registry, modelManager: manager });
    const result = await router.generateText([], { refreshBeforeRoute: false });
    assert.equal(result.provider, "anthropic");
});

test("router respects defaultModel when provided and available", async () => {
    const registry = createMockRegistry();
    const manager = new ProviderModelManager({ registry, defaultCooldownMs: 10_000 });
    manager.availability.upsertModels("p2", ["p2-a", "p2-z"], "configured");

    const router = new ModelRouter({ registry, modelManager: manager });
    const result = await router.generateText([], {
        provider: "p2",
        defaultModel: "p2-z",
        allowProviderFallback: false,
        refreshBeforeRoute: false
    });

    assert.equal(result.model, "p2-z");
});

test("router prefers models that support requested effort capabilities", async () => {
    const registry = new ProviderRegistry();
    registry.register({
        name: "anthropic",
        create: (opts?: any) => new MockProvider("anthropic", opts?.model || "claude-3-5-haiku-20241022"),
        modelPatterns: [/^claude-/i]
    });

    const manager = new ProviderModelManager({ registry, defaultCooldownMs: 10_000 });
    manager.availability.upsertModels(
        "anthropic",
        ["claude-3-5-haiku-20241022", "claude-3-5-sonnet-20241022"],
        "configured"
    );

    const router = new ModelRouter({ registry, modelManager: manager });
    const result = await router.generateText([], {
        provider: "anthropic",
        allowProviderFallback: false,
        refreshBeforeRoute: false,
        generateOptions: { effort: "high", adaptiveThinking: true }
    });

    assert.equal(result.model, "claude-3-5-sonnet-20241022");
});

test("router balances oauth accounts for same provider", async () => {
    const profile: OAuthProviderProfile = {
        id: "codex",
        displayName: "Codex",
        authorizeUrl: "https://example.com/auth",
        tokenUrl: "https://example.com/token",
        clientId: "client",
        scopes: ["openid"],
        redirectUri: "http://localhost/callback",
        authFlow: "pkce",
        identity: { cliName: "codex" }
    };
    const oauth = new OAuthManager({ store: new InMemoryOAuthStore() });
    oauth.registerProfile(profile);
    await oauth.saveAccountCredentials("codex", "a1", { accessToken: "tok-A" });
    await oauth.saveAccountCredentials("codex", "a2", { accessToken: "tok-B" });

    const usedKeys: string[] = [];
    const registry = new ProviderRegistry();
    registry.register({
        name: "openai",
        modelPatterns: [/^gpt-/i],
        create: (opts?: any) =>
            new MockProvider("openai", opts?.model || "gpt-4o", []).withGenerate(async () => {
                usedKeys.push(String(opts?.apiKey || ""));
                return { text: "ok", toolCalls: [] };
            })
    } as any);

    const manager = new ProviderModelManager({ registry, defaultCooldownMs: 10_000 });
    manager.availability.upsertModels("openai", ["gpt-4o"], "configured");
    const router = new ModelRouter({
        registry,
        modelManager: manager,
        oauthManager: oauth,
        oauthProfileByProvider: { openai: "codex" },
        oauthStrategy: "round_robin"
    });

    await router.generateText([], { provider: "openai", allowProviderFallback: false, refreshBeforeRoute: false });
    await router.generateText([], { provider: "openai", allowProviderFallback: false, refreshBeforeRoute: false });

    assert.deepEqual(usedKeys, ["tok-A", "tok-B"]);
});
