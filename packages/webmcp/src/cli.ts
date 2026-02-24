#!/usr/bin/env node
// Copyright 2026 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { GeminiProvider } from "@omni-agent/providers";
import {
    readFileTool, writeFileTool, readManyFilesTool, globTool,
    editTool, ripGrepTool, webSearchTool, memoryTool, bashTool,
    askUserTool, browserTool, McpServerManager, loadMcpServersFromConfigFile
} from "@omni-agent/tools";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { WebMcpServer } from "./index.js";

const args = process.argv.slice(2);
const getArg = (flag: string, def: string) => {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] ? args[i + 1] : def;
};
const hasFlag = (flag: string) => args.includes(flag);

const port = parseInt(getArg("--port", "3333"), 10);
const model = getArg("--model", "gemini-2.5-flash");
const mcpConfigPath = resolve(getArg("--mcp-config", ".mcp.json"));
const mcpAutoconnect = !hasFlag("--no-mcp-autoconnect");

async function main() {
    const provider = new GeminiProvider({ model });
    void provider;

    const toolList = [
        readFileTool(), writeFileTool(), readManyFilesTool(),
        globTool(), editTool(), ripGrepTool(), webSearchTool(),
        memoryTool(), bashTool(), askUserTool(), browserTool()
    ];

    let mcpServersLoaded = 0;
    const mcpManager = new McpServerManager();
    try {
        await access(mcpConfigPath);
        const mcpResult = await loadMcpServersFromConfigFile(mcpManager, mcpConfigPath, {
            autoConnect: mcpAutoconnect,
            continueOnError: true,
            cwd: process.cwd()
        });
        for (const tool of mcpManager.listEnabledTools()) {
            toolList.push(tool);
        }
        mcpServersLoaded = mcpResult.registered.length;
        for (const error of mcpResult.errors) {
            const scope = error.server ? `${error.server} (${error.stage})` : error.stage;
            console.warn(`MCP warning [${scope}]: ${error.message}`);
        }
    } catch {
        // optional .mcp.json
    }

    const tools = new Map(toolList.map(t => [t.name, t]));

    const server = new WebMcpServer({
        port,
        tools,
        resources: mcpManager.listResources().map((resource) => ({
            uri: resource.uri,
            name: resource.name,
            description: resource.description
        })),
        prompts: mcpManager.listPrompts().map((prompt) => ({
            name: prompt.name,
            description: prompt.description
        })),
        serverName: "OmniAgent WebMCP",
        serverVersion: "1.0.0"
    });

    await server.listen(port);

    console.log(`
╔══════════════════════════════════════════════════════╗
║          🌐  OmniAgent WebMCP Server v1.0            ║
╠══════════════════════════════════════════════════════╣
║  Status : Running                                    ║
║  Port   : ${port.toString().padEnd(42)}║
║  Model  : ${model.padEnd(42)}║
║  Tools  : ${tools.size.toString().padEnd(42)}║
║  MCP    : ${`${mcpServersLoaded} server(s) from ${mcpConfigPath}`.slice(0, 42).padEnd(42)}║
╠══════════════════════════════════════════════════════╣
║  MCP Endpoint  : http://localhost:${port}/mcp         ║
║  Tool Catalog  : http://localhost:${port}/tools        ║
║  Health Check  : http://localhost:${port}/health       ║
╠══════════════════════════════════════════════════════╣
║  Connect Claude Desktop:                             ║
║  Settings → Developer → MCP Servers → Add           ║
║  URL: http://localhost:${port}/mcp                    ║
╚══════════════════════════════════════════════════════╝
`);
    console.log("Press Ctrl+C to stop.\n");

    process.on("SIGINT", async () => {
        console.log("\nShutting down WebMCP server...");
        await mcpManager.close();
        await server.close();
        process.exit(0);
    });
}

main().catch(err => {
    console.error("Fatal error:", err.message);
    process.exit(1);
});
