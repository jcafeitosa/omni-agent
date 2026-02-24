export type McpConfigServerType = "stdio" | "http" | "sse";

export interface McpConfigOAuth {
    clientId?: string;
    callbackPort?: number;
    scopes?: string[];
    audience?: string;
    [key: string]: unknown;
}

export interface McpConfigServer {
    name: string;
    type: McpConfigServerType;
    enabled?: boolean;
    command?: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
    oauth?: McpConfigOAuth;
}

export interface ParseMcpConfigOptions {
    env?: Record<string, string | undefined>;
}

export function parseMcpConfig(raw: unknown, options: ParseMcpConfigOptions = {}): McpConfigServer[] {
    const env = options.env || process.env;
    const parsed = normalizeRoot(raw);
    const servers: McpConfigServer[] = [];

    for (const [name, value] of Object.entries(parsed)) {
        if (!value || typeof value !== "object") continue;
        const server = value as Record<string, unknown>;
        const normalized = normalizeServer(name, server, env);
        if (normalized) servers.push(normalized);
    }

    return servers;
}

function normalizeRoot(raw: unknown): Record<string, unknown> {
    if (!raw || typeof raw !== "object") return {};
    const obj = raw as Record<string, unknown>;
    if (obj.mcpServers && typeof obj.mcpServers === "object") {
        return obj.mcpServers as Record<string, unknown>;
    }
    return obj;
}

function normalizeServer(
    name: string,
    server: Record<string, unknown>,
    env: Record<string, string | undefined>
): McpConfigServer | undefined {
    const commandRaw = server.command ?? server.cmd;
    const command = commandRaw ? expandTemplate(String(commandRaw), env) : undefined;
    const argsRaw = Array.isArray(server.args) ? server.args : Array.isArray(server.arguments) ? server.arguments : undefined;
    const args = argsRaw?.map((value) => expandTemplate(String(value), env));
    const cwd = server.cwd ? expandTemplate(String(server.cwd), env) : undefined;
    const enabled = server.enabled !== false;

    const rawType = String(server.type || server.transport || "").trim().toLowerCase();
    const normalizedType = rawType.replace(/[-_]/g, "");
    const type: McpConfigServerType =
        normalizedType === "http" || normalizedType === "streamablehttp"
            ? "http"
            : normalizedType === "sse"
                ? "sse"
                : normalizedType === "stdio"
                    ? "stdio"
            : command
                ? "stdio"
                : "http";

    const url = server.url || server.endpoint ? expandTemplate(String(server.url || server.endpoint), env) : undefined;
    const headers = normalizeStringMap(server.headers, env);
    const oauth = normalizeOAuth(server.oauth);
    const envMap = normalizeStringMap(server.env, env);

    if (type === "stdio" && !command) return undefined;
    if ((type === "http" || type === "sse") && !url) return undefined;

    return {
        name,
        type,
        enabled,
        command,
        args,
        cwd,
        env: envMap,
        url,
        headers,
        oauth
    };
}

function normalizeStringMap(value: unknown, env: Record<string, string | undefined>): Record<string, string> | undefined {
    if (!value || typeof value !== "object") return undefined;
    const out: Record<string, string> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        out[key] = expandTemplate(String(val ?? ""), env);
    }
    return Object.keys(out).length ? out : undefined;
}

function normalizeOAuth(value: unknown): McpConfigOAuth | undefined {
    if (!value || typeof value !== "object") return undefined;
    const oauth = value as Record<string, unknown>;
    return {
        ...oauth,
        clientId: oauth.clientId ? String(oauth.clientId) : undefined,
        callbackPort: oauth.callbackPort !== undefined ? Number(oauth.callbackPort) : undefined,
        scopes: Array.isArray(oauth.scopes) ? oauth.scopes.map((scope) => String(scope)) : undefined,
        audience: oauth.audience ? String(oauth.audience) : undefined
    };
}

export function expandTemplate(value: string, env: Record<string, string | undefined>): string {
    return value.replace(/\$\{([A-Z0-9_]+)\}/gi, (_m, key) => env[key] ?? "");
}
