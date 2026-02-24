import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { McpServerManager, McpBridgeClient } from "./mcp-manager.js";
import { ToolDefinition } from "@omni-agent/core";

class MockBridge implements McpBridgeClient {
    public disconnectCount = 0;

    constructor(private readonly suffix: string) {}

    async discoverTools(): Promise<ToolDefinition[]> {
        return [
            {
                name: `mock_${this.suffix}`,
                description: "mock tool",
                parameters: z.object({}),
                execute: async () => "ok"
            }
        ];
    }

    async discoverResources(): Promise<Array<{ uri: string; name?: string; description?: string }>> {
        return [{ uri: `mock://${this.suffix}`, name: "resource" }];
    }

    async discoverPrompts(): Promise<Array<{ name: string; description?: string }>> {
        return [{ name: `prompt_${this.suffix}` }];
    }

    async disconnect(): Promise<void> {
        this.disconnectCount += 1;
    }

    async readResource(uri: string): Promise<any> {
        return { uri, content: `resource:${this.suffix}` };
    }

    async getPrompt(name: string, args?: Record<string, unknown>): Promise<any> {
        return { name, args: args || {}, content: `prompt:${this.suffix}` };
    }
}

test("mcp server manager reports status and toggles server", async () => {
    const manager = new McpServerManager();
    let bridgeRef: MockBridge | undefined;
    manager.registerBridgeServer("mock", () => {
        bridgeRef = new MockBridge("server");
        return bridgeRef;
    });

    let status = await manager.connectServer("mock");
    assert.equal(status.connected, true);
    assert.equal(status.tools, 1);
    assert.equal(manager.listEnabledTools().length, 1);

    status = await manager.toggleMcpServer("mock", false);
    assert.equal(status.enabled, false);
    assert.equal(status.connected, false);
    assert.equal(manager.listEnabledTools().length, 0);
    assert.equal((bridgeRef?.disconnectCount || 0) > 0, true);

    status = await manager.toggleMcpServer("mock", true);
    assert.equal(status.enabled, true);
    assert.equal(status.connected, true);
});

test("mcp server manager can reconnect server", async () => {
    const manager = new McpServerManager();
    let created = 0;
    manager.registerBridgeServer("mock", () => {
        created += 1;
        return new MockBridge(String(created));
    });

    await manager.connectServer("mock");
    const status = await manager.reconnectMcpServer("mock");
    assert.equal(status.connected, true);
    assert.equal(created, 2);
});

test("mcp server manager exposes resources/prompts and helper calls", async () => {
    const manager = new McpServerManager();
    manager.registerBridgeServer("mock", () => new MockBridge("helper"));

    await manager.connectServer("mock");

    const resources = manager.listResources("mock");
    assert.equal(resources.length, 1);
    assert.equal(resources[0].server, "mock");
    assert.equal(resources[0].uri, "mock://helper");

    const prompts = manager.listPrompts("mock");
    assert.equal(prompts.length, 1);
    assert.equal(prompts[0].server, "mock");
    assert.equal(prompts[0].name, "prompt_helper");

    const resource = await manager.readResource("mock", "mock://helper");
    assert.deepEqual(resource, { uri: "mock://helper", content: "resource:helper" });

    const prompt = await manager.getPrompt("mock", "prompt_helper", { a: 1 });
    assert.deepEqual(prompt, { name: "prompt_helper", args: { a: 1 }, content: "prompt:helper" });
});

test("mcp server manager enforces admin mcp toggle and allowlist/tool filters", async () => {
    const manager = new McpServerManager();
    manager.registerBridgeServer("allowed", () => new MockBridge("allowed"));
    manager.registerBridgeServer("blocked", () => new MockBridge("blocked"));

    manager.setAdminControls({
        mcpEnabled: false
    });
    let status = await manager.connectServer("allowed");
    assert.equal(status.connected, false);
    assert.match(status.error || "", /disabled by administrator/i);

    manager.setAdminControls({
        mcpEnabled: true,
        mcpAllowlist: {
            allowed: {
                includeTools: ["mock_allowed"]
            }
        }
    });

    status = await manager.connectServer("blocked");
    assert.equal(status.connected, false);
    assert.match(status.error || "", /allowlist/i);

    status = await manager.connectServer("allowed");
    assert.equal(status.connected, true);
    const tools = manager.listEnabledTools();
    assert.equal(tools.length, 1);
    assert.equal(tools[0].name, "mock_allowed");
});
