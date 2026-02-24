import test from "node:test";
import assert from "node:assert/strict";
import { OAuthCredentialStore, OAuthCredentials, OAuthManager, OAuthProviderProfile } from "./index.js";

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

test("oauth manager balances multiple accounts with round robin", async () => {
    const manager = new OAuthManager({ store: new InMemoryStore() });
    manager.registerProfile(profile);
    await manager.saveAccountCredentials("codex", "acc-a", { accessToken: "token-a" });
    await manager.saveAccountCredentials("codex", "acc-b", { accessToken: "token-b" });
    manager.setProviderStrategy("codex", "round_robin");

    const l1 = await manager.acquireAccessToken("codex");
    const l2 = await manager.acquireAccessToken("codex");
    const l3 = await manager.acquireAccessToken("codex");
    assert.equal(l1?.accessToken, "token-a");
    assert.equal(l2?.accessToken, "token-b");
    assert.equal(l3?.accessToken, "token-a");
    l1?.release();
    l2?.release();
    l3?.release();
});

test("oauth manager supports parallel strategy with in-flight balancing", async () => {
    const manager = new OAuthManager({ store: new InMemoryStore() });
    manager.registerProfile(profile);
    await manager.saveAccountCredentials("codex", "acc-a", { accessToken: "token-a" });
    await manager.saveAccountCredentials("codex", "acc-b", { accessToken: "token-b" });

    const l1 = await manager.acquireAccessToken("codex", { strategy: "parallel" });
    const l2 = await manager.acquireAccessToken("codex", { strategy: "parallel" });
    assert.notEqual(l1?.accountId, l2?.accountId);
    l1?.release();
    l2?.release();
});

