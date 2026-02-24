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

