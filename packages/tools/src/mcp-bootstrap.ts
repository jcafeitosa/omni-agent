import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { parseMcpConfig, McpConfigServer } from "./mcp-config.js";
import { McpServerManager, McpServerStatus } from "./mcp-manager.js";

export interface McpBootstrapError {
    server?: string;
    stage: "read" | "parse" | "register" | "connect";
    message: string;
}

export interface LoadMcpServersFromConfigFileOptions {
    env?: Record<string, string | undefined>;
    cwd?: string;
    autoConnect?: boolean;
    continueOnError?: boolean;
}

export interface LoadMcpServersFromConfigFileResult {
    configPath: string;
    discovered: McpConfigServer[];
    registered: string[];
    connected: McpServerStatus[];
    errors: McpBootstrapError[];
}

export async function loadMcpServersFromConfigFile(
    manager: McpServerManager,
    filePath: string,
    options: LoadMcpServersFromConfigFileOptions = {}
): Promise<LoadMcpServersFromConfigFileResult> {
    const resolvedPath = resolve(filePath);
    const continueOnError = options.continueOnError !== false;
    const autoConnect = options.autoConnect !== false;
    const errors: McpBootstrapError[] = [];

    let rawConfig = "";
    try {
        rawConfig = await readFile(resolvedPath, "utf8");
    } catch (error: any) {
        errors.push({
            stage: "read",
            message: error?.message || String(error)
        });
        return {
            configPath: resolvedPath,
            discovered: [],
            registered: [],
            connected: [],
            errors
        };
    }

    let parsedInput: unknown;
    try {
        parsedInput = JSON.parse(rawConfig);
    } catch (error: any) {
        errors.push({
            stage: "parse",
            message: error?.message || String(error)
        });
        return {
            configPath: resolvedPath,
            discovered: [],
            registered: [],
            connected: [],
            errors
        };
    }

    const discovered = parseMcpConfig(parsedInput, { env: options.env });
    const registered: string[] = [];

    for (const server of discovered) {
        if (server.enabled === false) continue;
        try {
            manager.registerTransportServer(server.name, () => createTransport(server, options.cwd));
            registered.push(server.name);
        } catch (error: any) {
            errors.push({
                server: server.name,
                stage: "register",
                message: error?.message || String(error)
            });
            if (!continueOnError) throw error;
        }
    }

    const connected: McpServerStatus[] = [];
    if (autoConnect) {
        for (const name of registered) {
            try {
                connected.push(await manager.connectServer(name));
            } catch (error: any) {
                errors.push({
                    server: name,
                    stage: "connect",
                    message: error?.message || String(error)
                });
                if (!continueOnError) throw error;
            }
        }
    }

    return {
        configPath: resolvedPath,
        discovered,
        registered,
        connected,
        errors
    };
}

function createTransport(server: McpConfigServer, cwd?: string) {
    if (server.type === "stdio") {
        if (!server.command) {
            throw new Error(`MCP stdio server '${server.name}' requires command`);
        }
        return new StdioClientTransport({
            command: server.command,
            args: server.args,
            env: server.env,
            cwd: server.cwd || cwd
        });
    }

    if (!server.url) {
        throw new Error(`MCP server '${server.name}' requires url`);
    }

    const headers = server.headers && Object.keys(server.headers).length ? server.headers : undefined;
    const target = new URL(server.url);
    if (server.type === "sse") {
        return new SSEClientTransport(target, {
            eventSourceInit: headers ? ({ headers } as any) : undefined,
            requestInit: headers ? { headers } : undefined
        });
    }

    return new StreamableHTTPClientTransport(target, {
        requestInit: headers ? { headers } : undefined
    });
}
