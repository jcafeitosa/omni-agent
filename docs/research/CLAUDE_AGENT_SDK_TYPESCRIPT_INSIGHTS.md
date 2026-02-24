# Claude Agent SDK TypeScript Insights (Applied to Omni-Agent)

Fonte analisada: `../claude-agent-sdk-typescript` (README + CHANGELOG).

## Achados de maior impacto

1. Metadados de capacidade de modelo para raciocinio:
- `supportsEffort`
- `supportedEffortLevels`
- `supportsAdaptiveThinking`

2. Sugestoes de permissao estruturadas quando a execucao e negada.

3. Evento de task com correlacao por `tool_use_id` para rastreabilidade.

4. API de Query com metodos adicionais para UX programatica (`close`, sugestao de prompt).

5. Operacao de MCP em runtime com introspecao e controle (`status`, `toggle`, `reconnect`).

## Implementacao no omni-agent

- `packages/core/src/index.ts`
  - classificacao de modelo expandida com capacidades de effort/adaptive-thinking.

- `packages/providers/src/utils/model-limits.ts`
  - catalogo passa a expor capacidades de effort/adaptive-thinking por familia de modelo.

- `packages/providers/src/routing.ts`
  - roteamento effort-aware quando `generateOptions` solicita `effort` ou `adaptiveThinking`.

- `packages/core/src/state/permissions.ts`
  - `PermissionResult` inclui `suggestions`.

- `packages/core/src/types/messages.ts`
  - novo evento `task_notification` com `tool_use_id`.

- `packages/core/src/loops/agent-loop.ts`
  - `Query.close()`
  - `Query.promptSuggestion()`
  - deteccao de mudancas de configuracao e emissao de hook `ConfigChange`
  - propagacao de `toolUseId` para contexto de tools.

- `packages/core/src/tools/subagent.ts`
  - emissao de `task_notification` em `run|plan|start|wait` com correlacao por `tool_use_id`.

- `packages/tools/src/mcp-manager.ts`
  - `mcpServerStatus()`, `toggleMcpServer()`, `reconnectMcpServer()`, agregacao de tools habilitadas.

## Validacao

- build monorepo: ok
- testes: ok (`core`, `providers`, `tools`)
