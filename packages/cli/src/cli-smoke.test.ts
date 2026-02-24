import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function runCli(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
    const cliPath = join(process.cwd(), "dist", "index.js");
    const { stdout, stderr } = await execFileAsync("node", [cliPath, ...args], {
        cwd,
        env: process.env
    });
    return { stdout: String(stdout || ""), stderr: String(stderr || "") };
}

test("cli plugins catalog lifecycle works end-to-end", async () => {
    const root = await mkdtemp(join(tmpdir(), "omni-cli-test-"));
    try {
        const sourcePluginDir = join(root, "source-plugin");
        await mkdir(join(sourcePluginDir, ".claude-plugin"), { recursive: true });
        await writeFile(
            join(sourcePluginDir, ".claude-plugin", "plugin.json"),
            JSON.stringify({ name: "demo-catalog-plugin", version: "1.0.0" }),
            "utf8"
        );

        const pluginsDir = join(root, "plugins");
        const stateFile = join(root, "plugins-state.json");
        const catalogFile = join(root, "plugins-catalog.json");

        const added = await runCli(
            [
                "plugins",
                "catalog-add",
                "--id",
                "demo-catalog-plugin@1.0.0",
                "--name",
                "demo-catalog-plugin",
                "--plugin-version",
                "1.0.0",
                "--source-type",
                "path",
                "--path",
                sourcePluginDir,
                "--plugins-dir",
                pluginsDir,
                "--plugins-state",
                stateFile,
                "--plugins-catalog",
                catalogFile
            ],
            process.cwd()
        );
        assert.match(added.stdout, /Catalog entry upserted/i);

        const listed = await runCli(["plugins", "catalog-list", "--plugins-catalog", catalogFile], process.cwd());
        assert.match(listed.stdout, /demo-catalog-plugin@1.0.0/);

        const installed = await runCli(
            [
                "plugins",
                "catalog-install",
                "--name",
                "demo-catalog-plugin",
                "--plugins-dir",
                pluginsDir,
                "--plugins-state",
                stateFile,
                "--plugins-catalog",
                catalogFile
            ],
            process.cwd()
        );
        assert.match(installed.stdout, /Installed plugin/i);
        await access(join(pluginsDir, "demo-catalog-plugin"));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("cli tasks and connectors commands persist expected state", async () => {
    const root = await mkdtemp(join(tmpdir(), "omni-cli-test-"));
    try {
        const tasksFile = join(root, "TASKS.md");
        const connectorsFile = join(root, "connectors.json");

        await runCli(
            [
                "tasks",
                "add",
                "--file",
                tasksFile,
                "--title",
                "Implement orchestrator",
                "--status",
                "in_progress",
                "--tags",
                "core,agents"
            ],
            process.cwd()
        );
        const listBefore = await runCli(["tasks", "list", "--file", tasksFile], process.cwd());
        assert.match(listBefore.stdout, /Implement orchestrator/);
        assert.match(listBefore.stdout, /in_progress/);

        await runCli(
            [
                "tasks",
                "set",
                "--file",
                tasksFile,
                "--id",
                "implement-orchestrator",
                "--status",
                "done"
            ],
            process.cwd()
        );
        const stats = await runCli(["tasks", "stats", "--file", tasksFile], process.cwd());
        assert.match(stats.stdout, /"done":\s*1/);

        await runCli(
            [
                "connectors",
                "upsert",
                "--file",
                connectorsFile,
                "--id",
                "crm-main",
                "--capability",
                "crm.read",
                "--provider",
                "remote-mcp",
                "--priority",
                "10",
                "--cost",
                "low",
                "--latency",
                "medium"
            ],
            process.cwd()
        );
        const resolved = await runCli(
            ["connectors", "resolve", "--file", connectorsFile, "--capability", "crm.read", "--strategy", "priority"],
            process.cwd()
        );
        assert.match(resolved.stdout, /crm-main/);

        await runCli(
            [
                "connectors",
                "fail",
                "--file",
                connectorsFile,
                "--id",
                "crm-main",
                "--cooldown-ms",
                "30000",
                "--error",
                "rate limit"
            ],
            process.cwd()
        );
        const listed = await runCli(["connectors", "list", "--file", connectorsFile, "--include-cooling-down"], process.cwd());
        assert.match(listed.stdout, /fails=1/);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
