import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { ToolDefinition } from "@omni-agent/core";
import { McpBridge } from "./mcp.js";

export interface AdminMcpAllowlistServer {
    url?: string;
    type?: "sse" | "http" | "stdio";
    trust?: boolean;
    includeTools?: string[];
    excludeTools?: string[];
}

export interface McpAdminControls {
    mcpEnabled?: boolean;
    mcpAllowlist?: Record<string, AdminMcpAllowlistServer>;
}

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
    readResource?(uri: string): Promise<any>;
    getPrompt?(name: string, args?: Record<string, unknown>): Promise<any>;
    disconnect(): Promise<void>;
}

interface ManagedMcpServer {
    name: string;
    enabled: boolean;
    bridgeFactory: () => McpBridgeClient;
    metadata?: {
        url?: string;
        type?: "sse" | "http" | "stdio";
        trust?: boolean;
        includeTools?: string[];
        excludeTools?: string[];
    };
    bridge?: McpBridgeClient;
    tools: ToolDefinition[];
    resources: Array<{ uri: string; name?: string; description?: string }>;
    prompts: Array<{ name: string; description?: string }>;
    error?: string;
}

export class McpServerManager {
    private readonly servers = new Map<string, ManagedMcpServer>();
    private adminControls?: McpAdminControls;

    public registerBridgeServer(
        name: string,
        bridgeFactory: () => McpBridgeClient,
        metadata?: ManagedMcpServer["metadata"]
    ): void {
        this.servers.set(name, {
            name,
            enabled: true,
            bridgeFactory,
            metadata,
            tools: [],
            resources: [],
            prompts: []
        });
    }

    public registerTransportServer(name: string, transportFactory: () => Transport): void {
        this.registerBridgeServer(name, () => new McpBridge(name, transportFactory()));
    }

    public setAdminControls(adminControls?: McpAdminControls): void {
        this.adminControls = adminControls;
    }

    public async connectServer(name: string): Promise<McpServerStatus> {
        const entry = this.mustGet(name);
        if (this.adminControls?.mcpEnabled === false) {
            entry.error = "MCP is disabled by administrator policy.";
            return this.statusOf(entry);
        }
        if (!this.isServerAllowlisted(entry.name)) {
            entry.error = "MCP server is blocked by administrator allowlist.";
            return this.statusOf(entry);
        }
        if (!entry.enabled) {
            return this.statusOf(entry);
        }

        if (!entry.bridge) {
            entry.bridge = entry.bridgeFactory();
        }

        try {
            entry.tools = await entry.bridge.discoverTools();
            entry.tools = this.applyAdminToolFilters(entry.name, entry.tools);
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

    public listResources(name?: string): Array<{ server: string; uri: string; name?: string; description?: string }> {
        const entries = name ? [this.mustGet(name)] : Array.from(this.servers.values());
        return entries.flatMap((entry) =>
            entry.resources.map((resource) => ({
                server: entry.name,
                ...resource
            }))
        );
    }

    public listPrompts(name?: string): Array<{ server: string; name: string; description?: string }> {
        const entries = name ? [this.mustGet(name)] : Array.from(this.servers.values());
        return entries.flatMap((entry) =>
            entry.prompts.map((prompt) => ({
                server: entry.name,
                ...prompt
            }))
        );
    }

    public async readResource(name: string, uri: string): Promise<any> {
        const entry = this.mustGet(name);
        if (!entry.enabled) {
            throw new Error(`MCP server is disabled: ${name}`);
        }
        if (!entry.bridge) {
            await this.connectServer(name);
        }
        if (!entry.bridge?.readResource) {
            throw new Error(`MCP server does not support readResource: ${name}`);
        }
        return entry.bridge.readResource(uri);
    }

    public async getPrompt(name: string, promptName: string, args?: Record<string, unknown>): Promise<any> {
        const entry = this.mustGet(name);
        if (!entry.enabled) {
            throw new Error(`MCP server is disabled: ${name}`);
        }
        if (!entry.bridge) {
            await this.connectServer(name);
        }
        if (!entry.bridge?.getPrompt) {
            throw new Error(`MCP server does not support getPrompt: ${name}`);
        }
        return entry.bridge.getPrompt(promptName, args);
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

    private isServerAllowlisted(name: string): boolean {
        const allowlist = this.adminControls?.mcpAllowlist;
        if (!allowlist) return true;
        const keys = Object.keys(allowlist);
        if (keys.length === 0) return true;
        return Object.prototype.hasOwnProperty.call(allowlist, name);
    }

    private applyAdminToolFilters(name: string, tools: ToolDefinition[]): ToolDefinition[] {
        const allowlist = this.adminControls?.mcpAllowlist;
        if (!allowlist) return tools;
        const rule = allowlist[name];
        if (!rule) return [];
        if (rule.includeTools && rule.includeTools.length > 0) {
            const include = new Set(rule.includeTools);
            return tools.filter((tool) => include.has(tool.name));
        }
        if (rule.excludeTools && rule.excludeTools.length > 0) {
            const exclude = new Set(rule.excludeTools);
            return tools.filter((tool) => !exclude.has(tool.name));
        }
        return tools;
    }
}
