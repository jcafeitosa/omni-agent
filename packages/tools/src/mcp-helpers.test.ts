import test from "node:test";
import assert from "node:assert/strict";
import { McpServerManager } from "./mcp-manager.js";
import { McpHelpers } from "./mcp-helpers.js";
import type { McpBridgeClient } from "./mcp-manager.js";
import type { ToolDefinition } from "@omni-agent/core";
import { z } from "zod";

class HelperBridge implements McpBridgeClient {
    async discoverTools(): Promise<ToolDefinition[]> {
        return [
            {
                name: "mock",
                description: "mock",
                parameters: z.object({}),
                execute: async () => "ok"
            }
        ];
    }

    async discoverResources(): Promise<Array<{ uri: string; name?: string; description?: string }>> {
        return [{ uri: "mock://resource", name: "r1" }];
    }

    async discoverPrompts(): Promise<Array<{ name: string; description?: string }>> {
        return [{ name: "p1" }];
    }

    async readResource(uri: string): Promise<any> {
        return { uri, content: "resource-content" };
    }

    async getPrompt(name: string): Promise<any> {
        return { name, content: "prompt-content" };
    }

    async disconnect(): Promise<void> {
        return;
    }
}

test("mcp helpers facade delegates to manager", async () => {
    const manager = new McpServerManager();
    manager.registerBridgeServer("mock", () => new HelperBridge());
    await manager.connectServer("mock");

    const helpers = new McpHelpers({ manager });
    const resources = helpers.listResources("mock");
    assert.equal(resources.length, 1);
    assert.equal(resources[0].uri, "mock://resource");

    const prompts = helpers.listPrompts("mock");
    assert.equal(prompts.length, 1);
    assert.equal(prompts[0].name, "p1");

    const resource = await helpers.readResource("mock", "mock://resource");
    assert.equal(resource.content, "resource-content");

    const prompt = await helpers.getPrompt("mock", "p1");
    assert.equal(prompt.content, "prompt-content");
});
