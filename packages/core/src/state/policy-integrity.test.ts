import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PolicyIntegrityManager } from "./policy-integrity.js";

test("policy integrity manager tracks new/match/mismatch", async () => {
    const root = await mkdtemp(join(tmpdir(), "omni-policy-integrity-"));
    try {
        const manager = new PolicyIntegrityManager({
            storagePath: join(root, "policy-integrity.json")
        });
        const payload = { rules: [{ id: "r1", effect: "deny" }] };
        const first = await manager.checkIntegrity("workspace", "repo-a", payload);
        assert.equal(first.status, "NEW");
        await manager.acceptIntegrity("workspace", "repo-a", first.hash);

        const second = await manager.checkIntegrity("workspace", "repo-a", payload);
        assert.equal(second.status, "MATCH");

        const third = await manager.checkIntegrity("workspace", "repo-a", {
            rules: [{ id: "r1", effect: "allow" }]
        });
        assert.equal(third.status, "MISMATCH");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
