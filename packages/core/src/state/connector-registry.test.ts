import test from "node:test";
import assert from "node:assert/strict";
import { ConnectorRegistry } from "./connector-registry.js";

test("connector registry resolves by priority and cooldown", () => {
    const registry = new ConnectorRegistry();
    registry.upsert({ id: "crm-a", capability: "crm.read", priority: 10 });
    registry.upsert({ id: "crm-b", capability: "crm.read", priority: 20 });

    const first = registry.resolve("crm.read", { strategy: "priority" });
    assert.equal(first?.id, "crm-a");

    registry.reportFailure("crm-a", { cooldownMs: 10_000, error: "429" });
    const second = registry.resolve("crm.read", { strategy: "priority" });
    assert.equal(second?.id, "crm-b");

    const stats = registry.getStats("crm-a");
    assert.equal(stats?.failCount, 1);
    assert.equal(stats?.lastError, "429");
});

test("connector registry round robin rotates candidates", () => {
    const registry = new ConnectorRegistry();
    registry.upsert({ id: "chat-a", capability: "chat.send", priority: 10 });
    registry.upsert({ id: "chat-b", capability: "chat.send", priority: 20 });

    const a = registry.resolve("chat.send", { strategy: "round_robin" });
    const b = registry.resolve("chat.send", { strategy: "round_robin" });
    const c = registry.resolve("chat.send", { strategy: "round_robin" });

    assert.equal(a?.id, "chat-a");
    assert.equal(b?.id, "chat-b");
    assert.equal(c?.id, "chat-a");
});

test("connector registry supports cost and latency strategies", () => {
    const registry = new ConnectorRegistry();
    registry.upsert({ id: "x", capability: "search.run", costClass: "high", latencyClass: "low" });
    registry.upsert({ id: "y", capability: "search.run", costClass: "low", latencyClass: "high" });

    const byCost = registry.resolve("search.run", { strategy: "lowest_cost" });
    const byLatency = registry.resolve("search.run", { strategy: "lowest_latency" });

    assert.equal(byCost?.id, "y");
    assert.equal(byLatency?.id, "x");
});

test("connector registry export/import keeps runtime state", () => {
    const registry = new ConnectorRegistry();
    registry.upsert({ id: "search-a", capability: "search.run", priority: 1 });
    registry.reportFailure("search-a", { cooldownMs: 5_000, error: "timeout" });

    const snapshot = registry.exportState();
    const restored = new ConnectorRegistry();
    restored.importState(snapshot);

    const stats = restored.getStats("search-a");
    assert.equal(stats?.failCount, 1);
    assert.equal(stats?.lastError, "timeout");
    assert.ok((stats?.cooldownUntil || 0) > Date.now());
});
