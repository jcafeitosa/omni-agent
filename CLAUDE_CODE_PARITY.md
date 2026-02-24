# Claude Code Feature Parity (Agents/Skills/Teams)

Data source: local analysis of `../claude-code` (README, plugins docs, CHANGELOG) and comparison with `omni-agent`.

## Legend

- `DONE`: implemented in `omni-agent`
- `PARTIAL`: implemented foundation/partial behavior
- `PENDING`: not implemented yet

## Agents and Subagents

- `DONE` Agent definitions via Markdown + frontmatter (`AgentManager`)
- `DONE` Tool allowlist/disallowlist per agent
- `DONE` Model override per agent
- `DONE` Max turns per agent
- `DONE` Cost budget per agent (`maxCostUsd`)
- `PARTIAL` Agent isolation (`isolation: worktree`) metadata supported, full isolated execution runtime pending
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
- `PARTIAL` Remote teammate processes (tmux/multi-process) not implemented

## Skills

- `DONE` Skill discovery and loading from multiple directories
- `DONE` Skill context injection into agent system prompt
- `DONE` Skill listing (`/skills`)
- `DONE` Skill hot-reload with filesystem watch
- `PARTIAL` Skill permission/hook frontmatter semantics are not fully enforced yet
- `PARTIAL` Skill usage ranking/frequency prioritization pending

## Hooks and Lifecycle Events

- `DONE` Hook manager with external command hooks
- `DONE` PreToolUse/PostToolUse/SessionStart/SessionEnd integration
- `DONE` Multi-agent lifecycle hooks: `SubagentStart`, `SubagentStop`, `TaskCompleted`, `TeammateIdle`
- `PARTIAL` Full hook policy precedence/managed hierarchy pending
- `PENDING` Full parity for all Claude-specific hook payload variants

## Permissions and Policy

- `DONE` Permission modes (`default`, `plan`, `dontAsk`, etc.)
- `DONE` Declarative policy engine (priority/rules/effects)
- `DONE` Tool permission checks integrated with policy engine
- `PARTIAL` Advanced permission suggestion UX/destination scopes pending

## Model Routing and Providers

- `DONE` Provider abstraction/registry
- `DONE` Model availability and cooldown
- `DONE` Router with fallback provider/model
- `DONE` OAuth-priority selection + explicit default model + latest/cheapest auto-selection
- `DONE` Local model runtime (`llama.cpp`) + Ollama local/remoto
- `PARTIAL` Per-task model effort/adaptive-thinking capability routing pending

## OAuth and CLI Identity

- `DONE` OAuth credential store (`auto|file|keyring`) and profile registry
- `DONE` PKCE/authorization_code/device_code login flows
- `DONE` Token refresh and header construction
- `DONE` CLI identity profiles (`codex`, `claude-code`, `cursor`, `gemini-cli`)
- `PARTIAL` Provider-specific interactive login UX (browser helpers/CLI command set) pending

## MCP and Plugins

- `DONE` MCP tools discovery/call bridge
- `DONE` MCP resources/prompts discovery and read/get
- `DONE` WebMCP support for tools/resources/prompts
- `PARTIAL` Dynamic `list_changed` push notifications not fully implemented
- `PARTIAL` Plugin marketplace/installation/version pinning not implemented

## Remaining High-Impact Gaps

1. Full worktree-isolated agent execution runtime (`isolation: worktree`)
2. Managed policy hierarchy + enterprise settings precedence
3. Plugin runtime lifecycle (install/enable/disable/update) and marketplace
4. Cross-process/remote team agents orchestration
5. Full skill frontmatter behavior parity (hooks/permissions/context fork)

