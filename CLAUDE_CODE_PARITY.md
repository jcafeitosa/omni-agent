# Claude Code Feature Parity (Agents/Skills/Teams)

Data source: local analysis of `../claude-code` (README, plugins docs, CHANGELOG) and comparison with `omni-agent`.

## Legend

- `DONE`: implemented in `omni-agent`
- `PARTIAL`: implemented foundation/partial behavior
- `PENDING`: not implemented yet

## Agents and Subagents

- `DONE` Agent definitions via Markdown + frontmatter (`AgentManager`)
- `DONE` Compat parsing for Claude Code frontmatter keys (`max-turns`, `max-cost-usd`, `permission-mode`, `allowed-agents`, `disallowed-tools`)
- `DONE` Auto-discovery of pre-existing agents in `plugins/*/agents` (local and sibling `claude-code`)
- `DONE` Compatibility mapping of Claude tool names (`Read`, `Write`, `Grep`, `Glob`, `LS`, etc.) to Omni tools
- `DONE` Tool allowlist/disallowlist per agent
- `DONE` Model override per agent
- `DONE` Max turns per agent
- `DONE` Cost budget per agent (`maxCostUsd`)
- `DONE` Agent isolation with git worktree runtime for task orchestration
- `DONE` Subagent spawning via `subagent` tool
- `DONE` Restrict spawn by agent (`allowedAgents`)
- `DONE` Agent listing command (`/agents`)

## Team / Collaboration / Tasks

- `DONE` Team plan orchestration with dependencies (`dependsOn`)
- `DONE` Parallel task execution (`maxParallel`)
- `DONE` Background tasks
- `DONE` Task lifecycle states: pending/running/background/completed/failed/cancelled
- `DONE` Task operations: start/status/list/cancel/wait/plan
- `DONE` Shared collaborative state between tasks + dependency handoff context
- `DONE` Task completion timing and result tracking
- `DONE` Cross-process task execution supported via `externalCommand` tasks

## Skills

- `DONE` Skill discovery and loading from multiple directories
- `DONE` Auto-discovery of pre-existing plugin skills in sibling `claude-code/plugins/*/skills`
- `DONE` Skill context injection into agent system prompt
- `DONE` Skill listing (`/skills`)
- `DONE` Skill hot-reload with filesystem watch
- `DONE` Skill frontmatter semantics: `agent`, `context`, `allowed-tools`, `disallowed-tools`, `hooks`, `user-invocable`
- `DONE` Skill hot-reload and contextual selection by agent
- `DONE` Collision-safe skill naming across plugins (`skill@plugin` fallback)

## Hooks and Lifecycle Events

- `DONE` Hook manager with external command hooks
- `DONE` PreToolUse/PostToolUse/SessionStart/SessionEnd integration
- `DONE` Multi-agent lifecycle hooks: `SubagentStart`, `SubagentStop`, `TaskCompleted`, `TeammateIdle`
- `DONE` Task/subagent/worktree lifecycle hooks wired into orchestration flow
- `PARTIAL` Managed enterprise hierarchy remains simplified (non-blocking)

## Permissions and Policy

- `DONE` Permission modes (`default`, `plan`, `dontAsk`, etc.)
- `DONE` Declarative policy engine (priority/rules/effects)
- `DONE` Tool permission checks integrated with policy engine
- `DONE` Permission suggestions payload returned on deny decisions (ready for UI/CLI integration)

## Model Routing and Providers

- `DONE` Provider abstraction/registry
- `DONE` Model availability and cooldown
- `DONE` Router with fallback provider/model
- `DONE` OAuth-priority selection + explicit default model + latest/cheapest auto-selection
- `DONE` Local model runtime (`llama.cpp`) + Ollama local/remoto
- `DONE` Per-task model effort/adaptive-thinking capability routing

## OAuth and CLI Identity

- `DONE` OAuth credential store (`auto|file|keyring`) and profile registry
- `DONE` PKCE/authorization_code/device_code login flows
- `DONE` Token refresh and header construction
- `DONE` CLI identity profiles (`codex`, `claude-code`, `cursor`, `gemini-cli`)
- `DONE` Multi-account OAuth sessions per provider with balancing (`single`, `round_robin`, `least_recent`, `parallel`, `random`)
- `PARTIAL` Provider-specific interactive login UX (browser helpers/CLI command set) pending

## MCP and Plugins

- `DONE` MCP tools discovery/call bridge
- `DONE` MCP resources/prompts discovery and read/get
- `DONE` WebMCP support for tools/resources/prompts
- `DONE` Dynamic `list_changed` push notifications for tools/resources/prompts in WebMCP SSE transport
- `DONE` Plugin runtime lifecycle foundations: discover/install/enable/disable/update with version-aware manifests

## Remaining High-Impact Gaps

1. Managed policy hierarchy + enterprise settings precedence
2. Plugin marketplace UI/distribution workflow (runtime backend already implemented)
