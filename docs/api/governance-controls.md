# Governance Controls

The core runtime now includes governance controls inspired by enterprise-grade CLI behavior.

## Workspace trust

- `WorkspaceTrustManager` (`@omni-agent/core`)
- Trust levels:
  - `TRUST_FOLDER`
  - `TRUST_PARENT`
  - `DO_NOT_TRUST`
- `PermissionManager` can consume trust state and block privileged modes in untrusted workspaces.

## Admin controls

- `AdminControlsSettings` (`@omni-agent/core`)
- Controls:
  - `strictModeEnabled` (blocks bypass mode when enabled)
  - `extensionsEnabled`
  - `mcpEnabled`
  - `mcpAllowlist`

### Runtime enforcement

- `PermissionManager`:
  - blocks privileged mode in untrusted workspace
  - blocks MCP tools when MCP is disabled by admin
  - blocks bypass mode when strict mode is enabled by admin
- `PluginManager`:
  - blocks install/enable workflows when extensions are disabled by admin
- `McpServerManager` (`@omni-agent/tools`):
  - blocks MCP connection when disabled by admin
  - enforces server allowlist and include/exclude tool filtering

## Policy integrity

- `PolicyIntegrityManager` (`@omni-agent/core`)
- Tracks integrity hash per `(scope, identifier)` and reports:
  - `NEW`
  - `MATCH`
  - `MISMATCH`
- Supports explicit acceptance/update of hash baseline.
