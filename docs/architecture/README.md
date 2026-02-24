# Architecture Overview

Omni Agent is a modular monorepo for multi-provider agent orchestration.

## Core packages

- `packages/core`: runtime loop, state, policies, auth abstractions, model availability.
- `packages/providers`: provider adapters (OpenAI/Anthropic/Gemini/Bedrock/Ollama/llama.cpp).
- `packages/tools`: local and remote tool execution.
- `packages/cli`: terminal UI.
- `packages/webmcp`: MCP server surface.

## Primary runtime flow

1. Load session and context.
2. Resolve provider/model (with availability/cooldown rules).
3. Execute loop with tool calls and permission checks.
4. Persist state and telemetry.

## Security boundaries

- Tool execution constraints and path protections.
- Provider auth/token handling with store abstraction.
- Sandbox providers for local execution.
