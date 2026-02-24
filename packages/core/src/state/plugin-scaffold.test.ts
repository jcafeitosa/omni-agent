import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createPluginScaffold, validatePluginStructure } from "./plugin-scaffold.js";

test("plugin scaffold creates a valid plugin structure", async () => {
    const dir = await mkdtemp(join(tmpdir(), "omni-plugin-scaffold-"));
    try {
        const pluginDir = await createPluginScaffold({
            rootDir: dir,
            name: "ops-assistant",
            author: "omni-team",
            capabilities: ["task.plan", "task.execute", "knowledge.search"],
            connectorCategories: ["~~knowledge", "~~crm"]
        });

        const validation = await validatePluginStructure(pluginDir);
        assert.equal(validation.ok, true);
        assert.equal(validation.issues.length, 0);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});
