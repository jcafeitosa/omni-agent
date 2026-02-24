import { McpServerManager } from "./mcp-manager.js";

export interface McpHelperOptions {
    manager: McpServerManager;
}

/**
 * High-level MCP helper facade for multi-server discovery and access.
 */
export class McpHelpers {
    private readonly manager: McpServerManager;

    constructor(options: McpHelperOptions) {
        this.manager = options.manager;
    }

    public listResources(server?: string): Array<{ server: string; uri: string; name?: string; description?: string }> {
        return this.manager.listResources(server);
    }

    public listPrompts(server?: string): Array<{ server: string; name: string; description?: string }> {
        return this.manager.listPrompts(server);
    }

    public async readResource(server: string, uri: string): Promise<any> {
        return this.manager.readResource(server, uri);
    }

    public async getPrompt(server: string, name: string, args?: Record<string, unknown>): Promise<any> {
        return this.manager.getPrompt(server, name, args);
    }
}
