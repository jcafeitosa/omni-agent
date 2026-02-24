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

import * as http from "node:http";
import { randomUUID } from "node:crypto";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ToolDefinition } from "@omni-agent/core";

export interface WebMcpServerOptions {
    port?: number;
    tools: Map<string, ToolDefinition>;
    serverName?: string;
    serverVersion?: string;
    resources?: Array<{ uri: string; name?: string; description?: string; mimeType?: string; text?: string }>;
    prompts?: Array<{ name: string; description?: string; arguments?: Array<{ name: string; required?: boolean; description?: string }>; template?: string }>;
}

interface SseClient {
    id: string;
    res: http.ServerResponse;
}

/**
 * WebMCPServer: A Streamable HTTP MCP server that exposes OmniAgent tools
 * to any MCP-compatible client (Claude Desktop, Cursor, web apps).
 *
 * Transport: Streamable HTTP (March 2025 MCP spec)
 *   - POST /mcp  → JSON-RPC 2.0 dispatcher (returns JSON or upgrades to SSE)
 *   - GET  /mcp  → SSE channel for server-push notifications
 *   - GET  /health → liveness probe
 *   - GET  /tools → human-readable tool catalog
 */
export class WebMcpServer {
    private server: http.Server;
    private tools: Map<string, ToolDefinition>;
    private clients: Map<string, SseClient> = new Map();
    private serverName: string;
    private serverVersion: string;
    private resources: Array<{ uri: string; name?: string; description?: string; mimeType?: string; text?: string }>;
    private prompts: Array<{ name: string; description?: string; arguments?: Array<{ name: string; required?: boolean; description?: string }>; template?: string }>;

    constructor(options: WebMcpServerOptions) {
        this.tools = options.tools;
        this.serverName = options.serverName ?? "OmniAgent WebMCP";
        this.serverVersion = options.serverVersion ?? "1.0.0";
        this.resources = options.resources ?? [];
        this.prompts = options.prompts ?? [];
        this.server = http.createServer(this.handleRequest.bind(this));
    }

    private setCorsHeaders(res: http.ServerResponse) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Mcp-Session-Id");
    }

    private sendJson(res: http.ServerResponse, code: number, body: unknown) {
        const json = JSON.stringify(body);
        res.writeHead(code, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
        });
        res.end(json);
    }

    private buildToolList() {
        return Array.from(this.tools.values()).map(tool => ({
            name: tool.name,
            description: tool.description,
            inputSchema: zodToJsonSchema(tool.parameters, { target: "openApi3" })
        }));
    }

    private async dispatchRpc(body: any): Promise<unknown> {
        const { method, params, id } = body;

        const rpcOk = (result: unknown) => ({ jsonrpc: "2.0", id, result });
        const rpcErr = (code: number, message: string) => ({
            jsonrpc: "2.0", id,
            error: { code, message }
        });

        if (method === "initialize") {
            return rpcOk({
                protocolVersion: "2024-11-05",
                capabilities: { tools: { listChanged: false } },
                serverInfo: { name: this.serverName, version: this.serverVersion }
            });
        }

        if (method === "notifications/initialized") {
            // Acknowledgement from client — no response needed in SSE, return null
            return null;
        }

        if (method === "ping") {
            return rpcOk({});
        }

        if (method === "tools/list") {
            return rpcOk({ tools: this.buildToolList() });
        }

        if (method === "resources/list") {
            return rpcOk({
                resources: this.resources.map((r) => ({
                    uri: r.uri,
                    name: r.name,
                    description: r.description,
                    mimeType: r.mimeType || "text/plain"
                }))
            });
        }

        if (method === "resources/read") {
            const uri = String(params?.uri || "");
            const resource = this.resources.find((r) => r.uri === uri);
            if (!resource) {
                return rpcErr(-32602, `Resource not found: ${uri}`);
            }
            return rpcOk({
                contents: [
                    {
                        uri: resource.uri,
                        mimeType: resource.mimeType || "text/plain",
                        text: resource.text || ""
                    }
                ]
            });
        }

        if (method === "prompts/list") {
            return rpcOk({
                prompts: this.prompts.map((p) => ({
                    name: p.name,
                    description: p.description,
                    arguments: p.arguments || []
                }))
            });
        }

        if (method === "prompts/get") {
            const name = String(params?.name || "");
            const prompt = this.prompts.find((p) => p.name === name);
            if (!prompt) {
                return rpcErr(-32602, `Prompt not found: ${name}`);
            }
            const argumentValues = (params?.arguments || {}) as Record<string, unknown>;
            const rendered = renderTemplate(prompt.template || "", argumentValues);
            return rpcOk({
                description: prompt.description,
                messages: [
                    {
                        role: "user",
                        content: {
                            type: "text",
                            text: rendered
                        }
                    }
                ]
            });
        }

        if (method === "tools/call") {
            const { name, arguments: args } = params ?? {};
            const tool = this.tools.get(name);
            if (!tool) {
                return rpcErr(-32601, `Tool not found: ${name}`);
            }
            try {
                const result = await tool.execute(args ?? {}, {});
                return rpcOk({
                    content: [{ type: "text", text: result }],
                    isError: false
                });
            } catch (err: any) {
                return rpcOk({
                    content: [{ type: "text", text: `Error: ${err.message}` }],
                    isError: true
                });
            }
        }

        return rpcErr(-32601, `Method not found: ${method}`);
    }

    private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        this.setCorsHeaders(res);

        if (req.method === "OPTIONS") {
            res.writeHead(204);
            res.end();
            return;
        }

        const url = new URL(req.url ?? "/", `http://localhost`);

        // ── GET /health ───────────────────────────────────────────────────────
        if (req.method === "GET" && url.pathname === "/health") {
            return this.sendJson(res, 200, { status: "ok", tools: this.tools.size });
        }

        // ── GET /tools ────────────────────────────────────────────────────────
        if (req.method === "GET" && url.pathname === "/tools") {
            return this.sendJson(res, 200, { tools: this.buildToolList() });
        }

        // ── GET /mcp — SSE channel ────────────────────────────────────────────
        if (req.method === "GET" && url.pathname === "/mcp") {
            const clientId = randomUUID();
            res.writeHead(200, {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "Access-Control-Allow-Origin": "*",
            });
            // MCP endpoint event
            res.write(`event: endpoint\ndata: ${JSON.stringify({ uri: "/mcp" })}\n\n`);
            this.clients.set(clientId, { id: clientId, res });

            // send keepalive every 15s
            const ka = setInterval(() => res.write(": keepalive\n\n"), 15000);
            req.on("close", () => {
                clearInterval(ka);
                this.clients.delete(clientId);
            });
            return;
        }

        // ── POST /mcp — JSON-RPC dispatcher ───────────────────────────────────
        if (req.method === "POST" && url.pathname === "/mcp") {
            let rawBody = "";
            for await (const chunk of req) rawBody += chunk;

            let body: any;
            try {
                body = JSON.parse(rawBody);
            } catch {
                return this.sendJson(res, 400, {
                    jsonrpc: "2.0", id: null,
                    error: { code: -32700, message: "Parse error" }
                });
            }

            // Handle batch or single
            const isBatch = Array.isArray(body);
            const requests = isBatch ? body : [body];

            // Check if client wants SSE (Accept: text/event-stream)
            const wantsSSE = req.headers["accept"]?.includes("text/event-stream");

            if (wantsSSE) {
                res.writeHead(200, {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                    "Access-Control-Allow-Origin": "*",
                });
                for (const rpc of requests) {
                    const result = await this.dispatchRpc(rpc);
                    if (result !== null) {
                        res.write(`data: ${JSON.stringify(result)}\n\n`);
                    }
                }
                res.end();
                return;
            }

            // Standard JSON response
            const results = await Promise.all(requests.map((r: any) => this.dispatchRpc(r)));
            const filtered = results.filter(r => r !== null);
            const response = isBatch ? filtered : filtered[0];
            return this.sendJson(res, 200, response);
        }

        this.sendJson(res, 404, { error: "Not Found" });
    }

    listen(port: number = 3333): Promise<void> {
        return new Promise((resolve) => {
            this.server.listen(port, () => resolve());
        });
    }

    close(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server.close(err => err ? reject(err) : resolve());
        });
    }
}

function renderTemplate(template: string, args: Record<string, unknown>): string {
    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => String(args[key] ?? ""));
}
