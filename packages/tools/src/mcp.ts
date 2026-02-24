import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { ToolDefinition } from "@omni-agent/core";
import { z } from "zod";

/**
 * OmniAgent MCP Server Bridge
 * Connects to any standard MCP server and maps its tools to OmniAgent's ToolDefinitions.
 */
export class McpBridge {
    private client: Client;

    constructor(public readonly serverName: string, private transport: Transport) {
        this.client = new Client(
            { name: "OmniAgent", version: "1.0.0" },
            { capabilities: {} }
        );
    }

    /**
     * Connects to the server and returns a list of OmniAgent-compatible tools.
     */
    async discoverTools(): Promise<ToolDefinition[]> {
        await this.client.connect(this.transport);

        const { tools } = await this.client.listTools();

        return tools.map((mcpTool) => {
            const paramSchema = z.any().describe(JSON.stringify(mcpTool.inputSchema));

            return {
                name: `${this.serverName}_${mcpTool.name}`,
                description: mcpTool.description || `MCP Tool from ${this.serverName}`,
                parameters: paramSchema,
                execute: async (args: any) => {
                    const result = await this.client.callTool({
                        name: mcpTool.name,
                        arguments: args
                    });

                    if (result.isError) {
                        throw new Error(`MCP Tool Error: ${JSON.stringify(result.content)}`);
                    }

                    return JSON.stringify(result.content);
                }
            };
        });
    }

    async discoverResources(): Promise<Array<{ uri: string; name?: string; description?: string }>> {
        await this.client.connect(this.transport);
        const fn = (this.client as any).listResources;
        if (typeof fn !== "function") return [];
        const response = await fn.call(this.client);
        const resources = response?.resources || [];
        return resources.map((r: any) => ({
            uri: String(r.uri || ""),
            name: r.name ? String(r.name) : undefined,
            description: r.description ? String(r.description) : undefined
        }));
    }

    async discoverPrompts(): Promise<Array<{ name: string; description?: string }>> {
        await this.client.connect(this.transport);
        const fn = (this.client as any).listPrompts;
        if (typeof fn !== "function") return [];
        const response = await fn.call(this.client);
        const prompts = response?.prompts || [];
        return prompts.map((p: any) => ({
            name: String(p.name || ""),
            description: p.description ? String(p.description) : undefined
        }));
    }

    async readResource(uri: string): Promise<any> {
        await this.client.connect(this.transport);
        const fn = (this.client as any).readResource;
        if (typeof fn !== "function") {
            throw new Error("MCP server does not support readResource");
        }
        return fn.call(this.client, { uri });
    }

    async getPrompt(name: string, args?: Record<string, unknown>): Promise<any> {
        await this.client.connect(this.transport);
        const fn = (this.client as any).getPrompt;
        if (typeof fn !== "function") {
            throw new Error("MCP server does not support getPrompt");
        }
        return fn.call(this.client, { name, arguments: args || {} });
    }

    async disconnect() {
        await this.client.close();
    }
}
