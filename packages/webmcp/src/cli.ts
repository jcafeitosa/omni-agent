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
    askUserTool, browserTool
} from "@omni-agent/tools";
import { WebMcpServer } from "./index.js";

const args = process.argv.slice(2);
const getArg = (flag: string, def: string) => {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] ? args[i + 1] : def;
};

const port = parseInt(getArg("--port", "3333"), 10);
const model = getArg("--model", "gemini-2.5-flash");

async function main() {
    const provider = new GeminiProvider({ model });

    const toolList = [
        readFileTool(), writeFileTool(), readManyFilesTool(),
        globTool(), editTool(), ripGrepTool(), webSearchTool(),
        memoryTool(), bashTool(), askUserTool(), browserTool()
    ];
    const tools = new Map(toolList.map(t => [t.name, t]));

    const server = new WebMcpServer({
        port,
        tools,
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
        await server.close();
        process.exit(0);
    });
}

main().catch(err => {
    console.error("Fatal error:", err.message);
    process.exit(1);
});
