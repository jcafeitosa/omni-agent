import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { ToolDefinition } from "@omni-agent/core";
import { McpBridge } from "./mcp.js";

export interface McpServerStatus {
    name: string;
    enabled: boolean;
    connected: boolean;
    tools: number;
    resources: number;
    prompts: number;
    error?: string;
}

export interface McpBridgeClient {
    discoverTools(): Promise<ToolDefinition[]>;
    discoverResources(): Promise<Array<{ uri: string; name?: string; description?: string }>>;
    discoverPrompts(): Promise<Array<{ name: string; description?: string }>>;
    disconnect(): Promise<void>;
}

interface ManagedMcpServer {
    name: string;
    enabled: boolean;
    bridgeFactory: () => McpBridgeClient;
    bridge?: McpBridgeClient;
    tools: ToolDefinition[];
    resources: Array<{ uri: string; name?: string; description?: string }>;
    prompts: Array<{ name: string; description?: string }>;
    error?: string;
}

export class McpServerManager {
    private readonly servers = new Map<string, ManagedMcpServer>();

    public registerBridgeServer(name: string, bridgeFactory: () => McpBridgeClient): void {
        this.servers.set(name, {
            name,
            enabled: true,
            bridgeFactory,
            tools: [],
            resources: [],
            prompts: []
        });
    }

    public registerTransportServer(name: string, transportFactory: () => Transport): void {
        this.registerBridgeServer(name, () => new McpBridge(name, transportFactory()));
    }

    public async connectServer(name: string): Promise<McpServerStatus> {
        const entry = this.mustGet(name);
        if (!entry.enabled) {
            return this.statusOf(entry);
        }

        if (!entry.bridge) {
            entry.bridge = entry.bridgeFactory();
        }

        try {
            entry.tools = await entry.bridge.discoverTools();
            entry.resources = await entry.bridge.discoverResources();
            entry.prompts = await entry.bridge.discoverPrompts();
            entry.error = undefined;
        } catch (error: any) {
            entry.error = error?.message || String(error);
        }

        return this.statusOf(entry);
    }

    public async reconnectMcpServer(name: string): Promise<McpServerStatus> {
        const entry = this.mustGet(name);
        await this.disconnectEntry(entry);
        entry.bridge = undefined;
        return this.connectServer(name);
    }

    public async toggleMcpServer(name: string, enabled?: boolean): Promise<McpServerStatus> {
        const entry = this.mustGet(name);
        const nextEnabled = enabled ?? !entry.enabled;
        entry.enabled = nextEnabled;

        if (!nextEnabled) {
            await this.disconnectEntry(entry);
            entry.bridge = undefined;
            entry.tools = [];
            entry.resources = [];
            entry.prompts = [];
            return this.statusOf(entry);
        }

        return this.connectServer(name);
    }

    public mcpServerStatus(name?: string): McpServerStatus[] {
        if (name) {
            return [this.statusOf(this.mustGet(name))];
        }
        return Array.from(this.servers.values()).map((entry) => this.statusOf(entry));
    }

    public listEnabledTools(): ToolDefinition[] {
        return Array.from(this.servers.values())
            .filter((entry) => entry.enabled && !entry.error)
            .flatMap((entry) => entry.tools);
    }

    public async close(): Promise<void> {
        await Promise.all(Array.from(this.servers.values()).map((entry) => this.disconnectEntry(entry)));
    }

    private statusOf(entry: ManagedMcpServer): McpServerStatus {
        return {
            name: entry.name,
            enabled: entry.enabled,
            connected: entry.enabled && Boolean(entry.bridge) && !entry.error,
            tools: entry.tools.length,
            resources: entry.resources.length,
            prompts: entry.prompts.length,
            error: entry.error
        };
    }

    private mustGet(name: string): ManagedMcpServer {
        const entry = this.servers.get(name);
        if (!entry) {
            throw new Error(`MCP server not registered: ${name}`);
        }
        return entry;
    }

    private async disconnectEntry(entry: ManagedMcpServer): Promise<void> {
        if (!entry.bridge) return;
        try {
            await entry.bridge.disconnect();
        } catch {
            // ignore disconnect failures
        }
    }
}
