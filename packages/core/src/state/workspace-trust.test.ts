import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { WorkspaceTrustManager } from "./workspace-trust.js";

test("workspace trust resolves trust with longest matching rule", async () => {
    const root = await mkdtemp(join(tmpdir(), "omni-trust-"));
    try {
        const configPath = join(root, "trustedFolders.json");
        await writeFile(
            configPath,
            JSON.stringify({
                "/repo": "TRUST_FOLDER",
                "/repo/unsafe": "DO_NOT_TRUST"
            }),
            "utf8"
        );
        const manager = new WorkspaceTrustManager({ configPath });
        assert.equal(manager.isPathTrusted("/repo/app"), true);
        assert.equal(manager.isPathTrusted("/repo/unsafe/service"), false);
        assert.equal(manager.isPathTrusted("/other"), undefined);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
