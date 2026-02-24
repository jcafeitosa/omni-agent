import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, utimes } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { RunReservationManager } from "./run-reservation.js";

test("run reservation acquires once and blocks concurrent acquire", async () => {
    const dir = await mkdtemp(join(tmpdir(), "omni-res-"));
    try {
        const markerPath = join(dir, "marker.json");
        const manager = new RunReservationManager(markerPath);

        const first = await manager.acquire({ key: "repo:1", owner: "run-a" });
        assert.equal(first.acquired, true);

        const second = await manager.acquire({ key: "repo:1", owner: "run-b" });
        assert.equal(second.acquired, false);
        assert.equal(second.current.owner, "run-a");
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("run reservation allows stale marker takeover", async () => {
    const dir = await mkdtemp(join(tmpdir(), "omni-res-"));
    try {
        const markerPath = join(dir, "marker.json");
        const manager = new RunReservationManager(markerPath, { staleAfterMs: 1 });
        await manager.acquire({ key: "repo:2", owner: "run-a" });

        const old = new Date(Date.now() - 60_000);
        await utimes(markerPath, old, old);

        const takeover = await manager.acquire({ key: "repo:2", owner: "run-b" });
        assert.equal(takeover.acquired, true);
        assert.equal(takeover.current.owner, "run-b");
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("run reservation can mark completed and failed", async () => {
    const dir = await mkdtemp(join(tmpdir(), "omni-res-"));
    try {
        const markerPath = join(dir, "marker.json");
        const manager = new RunReservationManager(markerPath);
        await manager.acquire({ key: "repo:3", owner: "run-a" });
        await manager.markCompleted({ findings: 3 });
        let record = await manager.read();
        assert.equal(record?.status, "completed");
        assert.equal(record?.metadata?.findings, 3);

        await manager.markFailed({ reason: "timeout" });
        record = await manager.read();
        assert.equal(record?.status, "failed");
        assert.equal(record?.metadata?.reason, "timeout");
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
