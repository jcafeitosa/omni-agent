import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { EventLogStore } from "./event-log-store.js";

test("event log store flushes and exports jsonl", async () => {
    const dir = await mkdtemp(join(tmpdir(), "omni-event-log-"));
    try {
        const filePath = join(dir, "events.log");
        const outPath = join(dir, "events.jsonl");
        const store = new EventLogStore({ filePath, batchSize: 2, flushIntervalMs: 1000 });
        await store.append({ ts: Date.now(), type: "text", payload: { text: "a" } });
        await store.append({ ts: Date.now(), type: "text", payload: { text: "b" } });
        await store.exportJsonl(outPath);
        const content = await readFile(outPath, "utf8");
        assert.equal(content.includes('"type":"text"'), true);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("event log store compacts retention", async () => {
    const dir = await mkdtemp(join(tmpdir(), "omni-event-log-"));
    try {
        const filePath = join(dir, "events.log");
        const store = new EventLogStore({ filePath, retentionDays: 1 });
        const now = Date.now();
        await store.append({ ts: now - 3 * 24 * 60 * 60 * 1000, type: "old", payload: {} });
        await store.append({ ts: now, type: "new", payload: {} });
        await store.flush();
        await store.compactRetention(now);
        const content = await readFile(filePath, "utf8");
        assert.equal(content.includes('"type":"old"'), false);
        assert.equal(content.includes('"type":"new"'), true);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
