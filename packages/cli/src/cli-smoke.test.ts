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

test("cli comm commands manage agents channels and messages", async () => {
    const root = await mkdtemp(join(tmpdir(), "omni-cli-comm-test-"));
    try {
        const stateFile = join(root, "comm-state.json");
        const eventLogFile = join(root, "comm-events.jsonl");
        const workspace = "ws-smoke";

        await runCli(
            [
                "comm",
                "register-agent",
                "--file",
                stateFile,
                "--event-log",
                eventLogFile,
                "--workspace",
                workspace,
                "--id",
                "owner",
                "--role",
                "owner"
            ],
            process.cwd()
        );
        await runCli(
            [
                "comm",
                "register-agent",
                "--file",
                stateFile,
                "--event-log",
                eventLogFile,
                "--workspace",
                workspace,
                "--id",
                "dev1",
                "--role",
                "agent",
                "--team",
                "core",
                "--department",
                "eng"
            ],
            process.cwd()
        );
        const created = await runCli(
            [
                "comm",
                "create-channel",
                "--file",
                stateFile,
                "--event-log",
                eventLogFile,
                "--workspace",
                workspace,
                "--name",
                "general",
                "--type",
                "general",
                "--created-by",
                "owner"
            ],
            process.cwd()
        );
        assert.match(created.stdout, /"id":\s*"general:general:/);
        const match = created.stdout.match(/"id":\s*"([^"]+)"/);
        assert.ok(match?.[1]);
        const channelId = match![1];

        await runCli(
            [
                "comm",
                "join-channel",
                "--file",
                stateFile,
                "--event-log",
                eventLogFile,
                "--workspace",
                workspace,
                "--channel",
                channelId,
                "--id",
                "dev1"
            ],
            process.cwd()
        );
        const posted = await runCli(
            [
                "comm",
                "post-message",
                "--file",
                stateFile,
                "--event-log",
                eventLogFile,
                "--workspace",
                workspace,
                "--channel",
                channelId,
                "--sender",
                "owner",
                "--text",
                "hello @dev1"
            ],
            process.cwd()
        );
        assert.match(posted.stdout, /"messageId"/);

        const list = await runCli(
            [
                "comm",
                "list-messages",
                "--file",
                stateFile,
                "--event-log",
                eventLogFile,
                "--workspace",
                workspace,
                "--channel",
                channelId
            ],
            process.cwd()
        );
        assert.match(list.stdout, /hello @dev1/);

        const search = await runCli(
            [
                "comm",
                "search-messages",
                "--file",
                stateFile,
                "--event-log",
                eventLogFile,
                "--workspace",
                workspace,
                "--query",
                "hello dev1"
            ],
            process.cwd()
        );
        assert.match(search.stdout, /hello @dev1/);

        const exported = join(root, "events-export.jsonl");
        const exportResult = await runCli(
            [
                "comm",
                "export-events",
                "--file",
                stateFile,
                "--event-log",
                eventLogFile,
                "--workspace",
                workspace,
                "--output",
                exported
            ],
            process.cwd()
        );
        assert.match(exportResult.stdout, /Events exported/);

        const compact = await runCli(
            [
                "comm",
                "compact-events",
                "--file",
                stateFile,
                "--event-log",
                eventLogFile,
                "--workspace",
                workspace,
                "--retention-days",
                "365",
                "--max-entries",
                "100"
            ],
            process.cwd()
        );
        assert.match(compact.stdout, /"before"/);

        const watch = await runCli(
            [
                "comm",
                "watch-events",
                "--file",
                stateFile,
                "--event-log",
                eventLogFile,
                "--workspace",
                workspace,
                "--from-seq",
                "0"
            ],
            process.cwd()
        );
        assert.match(watch.stdout, /"kind":"post_message"/);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("cli mcp commands list toggle and status config", async () => {
    const root = await mkdtemp(join(tmpdir(), "omni-cli-mcp-test-"));
    try {
        const mcpFile = join(root, ".mcp.json");
        const initialized = await runCli(["mcp", "init", "--file", mcpFile], process.cwd());
        assert.match(initialized.stdout, /MCP config initialized/i);

        await writeFile(
            mcpFile,
            JSON.stringify(
                {
                    mcpServers: {
                        remoteA: {
                            type: "http",
                            url: "https://example.com/mcp"
                        },
                        remoteB: {
                            transport: "streamable-http",
                            endpoint: "https://example.org/mcp",
                            enabled: false
                        },
                        broken: {
                            type: "http"
                        }
                    }
                },
                null,
                2
            ),
            "utf8"
        );

        const listed = await runCli(["mcp", "list", "--file", mcpFile], process.cwd());
        assert.match(listed.stdout, /remoteA/);
        assert.match(listed.stdout, /remoteB/);
        assert.doesNotMatch(listed.stdout, /broken/);

        const doctor = await runCli(["mcp", "doctor", "--file", mcpFile], process.cwd());
        assert.match(doctor.stdout, /"configured":\s*3/);
        assert.match(doctor.stdout, /"parsed":\s*2/);
        assert.match(doctor.stdout, /broken/);

        const upserted = await runCli(
            [
                "mcp",
                "upsert",
                "--file",
                mcpFile,
                "--server",
                "localFs",
                "--type",
                "stdio",
                "--command",
                "node",
                "--args",
                "server.js,--safe",
                "--enabled",
                "true"
            ],
            process.cwd()
        );
        assert.match(upserted.stdout, /MCP server upserted: localFs/);

        const listedWithUpsert = await runCli(["mcp", "list", "--file", mcpFile], process.cwd());
        assert.match(listedWithUpsert.stdout, /localFs/);

        const toggled = await runCli(["mcp", "toggle", "--file", mcpFile, "--server", "remoteA", "--enabled", "false"], process.cwd());
        assert.match(toggled.stdout, /enabled=false/);

        const listedAfter = await runCli(["mcp", "list", "--file", mcpFile], process.cwd());
        assert.match(listedAfter.stdout, /"name": "remoteA"/);
        assert.match(listedAfter.stdout, /"enabled": false/);

        const removed = await runCli(["mcp", "remove", "--file", mcpFile, "--server", "localFs"], process.cwd());
        assert.match(removed.stdout, /MCP server removed: localFs/);
        const listedAfterRemove = await runCli(["mcp", "list", "--file", mcpFile], process.cwd());
        assert.doesNotMatch(listedAfterRemove.stdout, /localFs/);

        const status = await runCli(["mcp", "status", "--file", mcpFile, "--autoconnect", "false"], process.cwd());
        assert.match(status.stdout, /"discovered":\s*2/);
        assert.match(status.stdout, /"registered":\s*0/);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
