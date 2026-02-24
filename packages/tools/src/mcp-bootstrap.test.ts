import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { McpServerManager } from "./mcp-manager.js";
import { loadMcpServersFromConfigFile } from "./mcp-bootstrap.js";

test("loadMcpServersFromConfigFile registers and skips disabled servers", async () => {
    const root = await mkdtemp(join(tmpdir(), "omni-mcp-bootstrap-"));
    const file = join(root, ".mcp.json");
    await writeFile(
        file,
        JSON.stringify(
            {
                mcpServers: {
                    fs: {
                        type: "stdio",
                        command: "node",
                        args: ["server.js"]
                    },
                    remote: {
                        transport: "streamable-http",
                        endpoint: "https://example.com/mcp"
                    },
                    disabledOne: {
                        type: "http",
                        url: "https://example.com/disabled",
                        enabled: false
                    }
                }
            },
            null,
            2
        ),
        "utf8"
    );

    const manager = new McpServerManager();
    const result = await loadMcpServersFromConfigFile(manager, file, {
        autoConnect: false
    });

    assert.equal(result.discovered.length, 3);
    assert.deepEqual(result.registered.sort(), ["fs", "remote"]);
    assert.equal(result.errors.length, 0);
    assert.equal(manager.mcpServerStatus().length, 2);
});

test("loadMcpServersFromConfigFile reports parse errors", async () => {
    const root = await mkdtemp(join(tmpdir(), "omni-mcp-bootstrap-"));
    const file = join(root, ".mcp.json");
    await writeFile(file, "{invalid-json", "utf8");

    const manager = new McpServerManager();
    const result = await loadMcpServersFromConfigFile(manager, file, {
        autoConnect: false
    });

    assert.equal(result.registered.length, 0);
    assert.equal(result.connected.length, 0);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].stage, "parse");
});
