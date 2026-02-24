import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { MemoryStore } from "./memory-store.js";

test("memory store remembers, recalls, searches and forgets records", async () => {
    const store = new MemoryStore();
    store.remember("project", "policy", "always run tests", { metadata: { source: "user" } });
    store.remember("project", "oauth", "prefer oauth accounts");

    const recalled = store.recall("project", "policy");
    assert.equal(recalled?.value, "always run tests");

    const found = store.search("project", "oauth");
    assert.equal(found.length, 1);
    assert.equal(found[0].key, "oauth");

    const removed = store.forget("project", "oauth");
    assert.equal(removed, true);
    assert.equal(store.recall("project", "oauth"), undefined);
});

test("memory store persists records to disk", async () => {
    const dir = await mkdtemp(join(tmpdir(), "omni-memory-"));
    const filePath = join(dir, "memory.json");
    try {
        const writer = new MemoryStore({ filePath });
        writer.remember("project", "a", "b");
        await writer.save();

        const reader = new MemoryStore({ filePath });
        await reader.load();
        const recalled = reader.recall("project", "a");
        assert.equal(recalled?.value, "b");
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("memory store compacts expired entries", async () => {
    const store = new MemoryStore();
    store.remember("session", "short", "ttl", { ttlMs: 1 });
    await new Promise((resolve) => setTimeout(resolve, 5));
    store.compactExpired();
    assert.equal(store.recall("session", "short"), undefined);
});

test("memory store supports hot/deep tiers and promotion flow", () => {
    const store = new MemoryStore();
    store.rememberDeep("project", "architecture", "layered");
    store.rememberHot("session", "current-task", "implement registry");

    const hot = store.listByTier("hot");
    const deep = store.listByTier("deep");
    assert.equal(hot.length, 1);
    assert.equal(deep.length, 1);
    assert.equal(hot[0].key, "current-task");

    store.promoteToHot("project", "architecture");
    const promoted = store.recall("project", "architecture");
    assert.equal(promoted?.tier, "hot");

    store.demoteToDeep("project", "architecture");
    const demoted = store.recall("project", "architecture");
    assert.equal(demoted?.tier, "deep");
});
