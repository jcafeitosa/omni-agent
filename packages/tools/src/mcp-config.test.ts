import test from "node:test";
import assert from "node:assert/strict";
import { parseMcpConfig, expandTemplate } from "./mcp-config.js";

test("parseMcpConfig supports flat root and mcpServers schemas", () => {
    const flat = parseMcpConfig({
        github: {
            type: "http",
            url: "https://api.github.com/mcp"
        }
    });
    assert.equal(flat.length, 1);
    assert.equal(flat[0].name, "github");

    const nested = parseMcpConfig({
        mcpServers: {
            stripe: {
                type: "http",
                url: "https://mcp.stripe.com"
            }
        }
    });
    assert.equal(nested.length, 1);
    assert.equal(nested[0].name, "stripe");
});

test("parseMcpConfig normalizes stdio env and oauth metadata", () => {
    const parsed = parseMcpConfig(
        {
            slack: {
                type: "http",
                url: "https://mcp.slack.com/mcp",
                oauth: {
                    clientId: "abc",
                    callbackPort: 3118,
                    scopes: ["chat:read"]
                }
            },
            fs: {
                command: "npx",
                args: ["-y", "@modelcontextprotocol/server-filesystem", "${CLAUDE_PROJECT_DIR}"],
                env: {
                    TOKEN: "${API_TOKEN}"
                }
            }
        },
        {
            env: {
                CLAUDE_PROJECT_DIR: "/repo",
                API_TOKEN: "tok"
            }
        }
    );

    const slack = parsed.find((s) => s.name === "slack");
    assert.ok(slack?.oauth);
    assert.equal(slack?.oauth?.clientId, "abc");
    assert.equal(slack?.oauth?.callbackPort, 3118);

    const fsServer = parsed.find((s) => s.name === "fs");
    assert.equal(fsServer?.type, "stdio");
    assert.equal(fsServer?.args?.includes("/repo"), true);
    assert.equal(fsServer?.env?.TOKEN, "tok");
});

test("parseMcpConfig supports transport aliases and enable flags", () => {
    const parsed = parseMcpConfig({
        mcpServers: {
            github: {
                transport: "streamable-http",
                endpoint: "https://example.com/mcp",
                enabled: false
            },
            local: {
                cmd: "node",
                arguments: ["server.mjs"],
                cwd: "${WORKDIR}"
            }
        }
    }, {
        env: {
            WORKDIR: "/tmp/repo"
        }
    });

    const github = parsed.find((s) => s.name === "github");
    assert.equal(github?.type, "http");
    assert.equal(github?.enabled, false);
    assert.equal(github?.url, "https://example.com/mcp");

    const local = parsed.find((s) => s.name === "local");
    assert.equal(local?.type, "stdio");
    assert.equal(local?.command, "node");
    assert.deepEqual(local?.args, ["server.mjs"]);
    assert.equal(local?.cwd, "/tmp/repo");
});

test("expandTemplate replaces environment placeholders", () => {
    const out = expandTemplate("Bearer ${API_TOKEN}", { API_TOKEN: "123" });
    assert.equal(out, "Bearer 123");
});
