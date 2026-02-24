import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HeartbeatService } from "./heartbeat-service.js";

test("heartbeat service creates template and executes handler", async () => {
    const dir = await mkdtemp(join(tmpdir(), "omni-heartbeat-"));
    let calls = 0;
    const service = new HeartbeatService({
        workspaceDir: dir,
        intervalMs: 5_000,
        onHeartbeat: async (prompt) => {
            calls += 1;
            assert.match(prompt, /Heartbeat Check/);
            return { status: "ok", message: "done" };
        }
    });

    await service.start();
    const filePath = join(dir, "HEARTBEAT.md");
    const raw = await readFile(filePath, "utf8");
    assert.match(raw, /Heartbeat Tasks/);

    await service.executeNow();
    service.stop();
    assert.equal(calls, 1);
});

