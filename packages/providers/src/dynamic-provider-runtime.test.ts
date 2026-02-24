import test from "node:test";
import assert from "node:assert/strict";
import { OAuthCredentialStore, OAuthCredentials, OAuthManager, ProviderRegistry } from "@omni-agent/core";
import { DynamicProviderRuntime } from "./dynamic-provider-runtime.js";

class InMemoryStore implements OAuthCredentialStore {
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

test("dynamic provider runtime registers provider and oauth profile", () => {
    const registry = new ProviderRegistry();
    const oauth = new OAuthManager({ store: new InMemoryStore() });
    const runtime = new DynamicProviderRuntime(registry, oauth);

    runtime.register({
        name: "custom-ext",
        sourceId: "ext:test",
        modelPatterns: [/^custom-/i],
        create: () => ({
            name: "custom-ext",
            generateText: async () => ({ text: "ok", toolCalls: [] }),
            embedText: async () => [],
            embedBatch: async () => [],
            getModelLimits: () => ({
                provider: "custom-ext",
                model: "custom-a",
                contextWindowTokens: null,
                maxOutputTokens: null,
                maxInputTokens: null,
                source: "configured"
            })
        }),
        oauthProfile: {
            id: "custom-ext",
            displayName: "Custom Ext",
            authorizeUrl: "https://example.com/auth",
            tokenUrl: "https://example.com/token",
            clientId: "client",
            scopes: ["openid"],
            redirectUri: "http://localhost/callback",
            authFlow: "pkce",
            identity: { cliName: "custom-ext" }
        }
    });

    assert.equal(registry.has("custom-ext"), true);
    assert.equal(oauth.getProfile("custom-ext")?.displayName, "Custom Ext");

    const removed = runtime.unregisterBySource("ext:test");
    assert.equal(removed, 1);
    assert.equal(registry.has("custom-ext"), false);
});
