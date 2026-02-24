# MCP Runtime and CLI

This document describes MCP runtime integration and CLI operations in Omni Agent.

## Runtime bootstrap from `.mcp.json`

`@omni-agent/tools` provides:

- `parseMcpConfig(raw, { env })`
- `loadMcpServersFromConfigFile(manager, filePath, options)`
- `McpServerManager`

Supported config formats:

- Flat root:
  - `{ "serverA": { ... }, "serverB": { ... } }`
- Nested:
  - `{ "mcpServers": { "serverA": { ... } } }`

Supported server fields:

- `type` or `transport`: `stdio | http | sse | streamable-http`
- `command` or `cmd` (stdio)
- `args` or `arguments`
- `cwd`
- `url` or `endpoint`
- `headers`
- `env`
- `enabled`
- `oauth` metadata (normalized, passthrough-compatible)

## CLI command: `mcp`

`@omni-agent/cli` exposes `mcp <mcpCmd>`:

- `list`
- `init`
- `doctor`
- `status`
- `upsert`
- `remove`
- `toggle`
- `reconnect`
- `resources`
- `prompts`
- `read`
- `get-prompt`

Common options:

- `--file <path>` (default `.mcp.json`)
- `--server <name>`
- `--autoconnect <true|false>`
- `--enabled <true|false>` (`toggle`)
- `--uri <resource-uri>` (`read`)
- `--name <prompt-name>` (`get-prompt`)
- `--arguments '<json-object>'` (`get-prompt`)

Examples:

```bash
node packages/cli/dist/index.js mcp list --file .mcp.json
node packages/cli/dist/index.js mcp init --file .mcp.json
node packages/cli/dist/index.js mcp doctor --file .mcp.json
node packages/cli/dist/index.js mcp upsert --file .mcp.json --server localFs --type stdio --command node --args "server.js,--safe" --enabled true
node packages/cli/dist/index.js mcp remove --file .mcp.json --server localFs
node packages/cli/dist/index.js mcp status --file .mcp.json --autoconnect false
node packages/cli/dist/index.js mcp toggle --file .mcp.json --server github --enabled false
node packages/cli/dist/index.js mcp resources --file .mcp.json --server github
node packages/cli/dist/index.js mcp prompts --file .mcp.json --server github
node packages/cli/dist/index.js mcp read --file .mcp.json --server github --uri mcp://resource/id
node packages/cli/dist/index.js mcp get-prompt --file .mcp.json --server github --name summarize --arguments '{"topic":"release"}'
```

## Interactive CLI autoload

Interactive CLI now loads MCP config at startup:

- `--mcp-config <path>` (default `.mcp.json`)
- `--mcp-autoconnect <true|false>` (default `true`)

When servers are connected, discovered MCP tools are merged into the runtime tool map.

## WebMCP autoload

`@omni-agent/webmcp` also supports MCP autoload:

- `--mcp-config <path>` (default `.mcp.json`)
- `--no-mcp-autoconnect`

At startup, discovered tools/resources/prompts are exposed automatically through WebMCP endpoints.
