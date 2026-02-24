import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PluginManager } from "./plugin-manager.js";

test("plugin manager installs plugin from catalog path source", async () => {
    const root = await mkdtemp(join(tmpdir(), "omni-plugin-manager-"));
    try {
        const sourcePluginDir = join(root, "source-plugin");
        await mkdir(join(sourcePluginDir, ".claude-plugin"), { recursive: true });
        await writeFile(
            join(sourcePluginDir, ".claude-plugin", "plugin.json"),
            JSON.stringify({
                name: "demo-plugin",
                version: "1.2.3"
            }),
            "utf8"
        );
        await writeFile(join(sourcePluginDir, "README.md"), "# Demo\n", "utf8");

        const manager = new PluginManager({
            pluginsDir: join(root, ".omniagent", "plugins"),
            stateFile: join(root, ".omniagent", "plugins-state.json"),
            catalogFile: join(root, ".omniagent", "plugins-catalog.json")
        });

        await manager.upsertCatalogEntry({
            id: "demo-plugin@1.2.3",
            name: "demo-plugin",
            version: "1.2.3",
            source: { type: "path", path: sourcePluginDir }
        });

        const installed = await manager.installFromCatalog("demo-plugin");
        assert.equal(installed.name, "demo-plugin");
        assert.equal(installed.installSource, "catalog");
        assert.equal(installed.installedVersion, "1.2.3");

        const listed = await manager.listInstalled();
        assert.equal(listed.length, 1);
        assert.equal(listed[0]?.name, "demo-plugin");
        assert.equal(listed[0]?.installedVersion, "1.2.3");
        assert.equal(listed[0]?.installSource, "catalog");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("plugin manager selects latest catalog version when version is omitted", async () => {
    const root = await mkdtemp(join(tmpdir(), "omni-plugin-manager-"));
    try {
        const v1Dir = join(root, "plugin-v1");
        const v2Dir = join(root, "plugin-v2");
        await mkdir(join(v1Dir, ".claude-plugin"), { recursive: true });
        await mkdir(join(v2Dir, ".claude-plugin"), { recursive: true });
        await writeFile(join(v1Dir, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "demo", version: "1.0.0" }), "utf8");
        await writeFile(join(v2Dir, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "demo", version: "2.0.0" }), "utf8");

        const manager = new PluginManager({
            pluginsDir: join(root, ".omniagent", "plugins"),
            stateFile: join(root, ".omniagent", "plugins-state.json"),
            catalogFile: join(root, ".omniagent", "plugins-catalog.json")
        });

        await manager.upsertCatalogEntry({
            id: "demo@1.0.0",
            name: "demo",
            version: "1.0.0",
            source: { type: "path", path: v1Dir }
        });
        await manager.upsertCatalogEntry({
            id: "demo@2.0.0",
            name: "demo",
            version: "2.0.0",
            source: { type: "path", path: v2Dir }
        });

        const installed = await manager.installFromCatalog("demo");
        assert.equal(installed.installedVersion, "2.0.0");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("plugin manager blocks installation when extensions are disabled by admin", async () => {
    const root = await mkdtemp(join(tmpdir(), "omni-plugin-manager-"));
    try {
        const sourcePluginDir = join(root, "source-plugin");
        await mkdir(join(sourcePluginDir, ".claude-plugin"), { recursive: true });
        await writeFile(
            join(sourcePluginDir, ".claude-plugin", "plugin.json"),
            JSON.stringify({
                name: "blocked-plugin",
                version: "1.0.0"
            }),
            "utf8"
        );
        const manager = new PluginManager({
            pluginsDir: join(root, ".omniagent", "plugins"),
            stateFile: join(root, ".omniagent", "plugins-state.json"),
            catalogFile: join(root, ".omniagent", "plugins-catalog.json"),
            adminControls: { extensionsEnabled: false }
        });
        await assert.rejects(() => manager.installFromPath(sourcePluginDir), /disabled by administrator/i);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("plugin manager validates catalog entries and stores marketplace metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "omni-plugin-manager-"));
    try {
        const sourcePluginDir = join(root, "source-plugin");
        await mkdir(join(sourcePluginDir, ".claude-plugin"), { recursive: true });
        await writeFile(
            join(sourcePluginDir, ".claude-plugin", "plugin.json"),
            JSON.stringify({ name: "ops", version: "1.0.0" }),
            "utf8"
        );

        const manager = new PluginManager({
            pluginsDir: join(root, ".omniagent", "plugins"),
            stateFile: join(root, ".omniagent", "plugins-state.json"),
            catalogFile: join(root, ".omniagent", "plugins-catalog.json")
        });

        await assert.rejects(
            () =>
                manager.upsertCatalogEntry({
                    id: "",
                    name: "broken",
                    version: "1.0.0",
                    source: { type: "path", path: sourcePluginDir }
                } as any),
            /id is required/i
        );

        await manager.upsertCatalogEntry({
            id: "ops@1.0.0",
            name: "ops",
            version: "1.0.0",
            author: "omni-team",
            category: "operations",
            capabilities: ["task.plan", "task.execute"],
            connectorCategories: ["~~knowledge"],
            source: { type: "path", path: sourcePluginDir }
        });

        const entries = await manager.listCatalog();
        assert.equal(entries.length, 1);
        assert.equal(entries[0].author, "omni-team");
        assert.deepEqual(entries[0].capabilities, ["task.plan", "task.execute"]);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
