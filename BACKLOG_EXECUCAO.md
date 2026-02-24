# Backlog de Execucao (P0/P1/P2)

> Status de fechamento: gaps tecnicos internos priorizados foram implementados e validados por testes.
> Pendencia ativa remanescente: `DEVOPS-202` (publicacao GitHub Packages), dependente de configuracao externa de owner/scope.

## Progresso atual

- concluido: CORE-001 (contrato unico de eventos/erros no core)
- concluido: padronizacao de erro terminal em slash commands (result:error)
- concluido parcial: TOOLS-001 (timeout default + limite de comando no bash)
- concluido parcial: TOOLS-002 (validacao de path em `read_file`, `write_file`, `edit`, `rip_grep`)
- concluido parcial: TOOLS-002 (validacao de path em `memory`)
- concluido parcial: TOOLS-002 (validacao de pattern segura em `glob` e `read_many_files`)
- concluido parcial: TOOLS-001 (git tools sem shell/interpolacao via `execFileSync`)
- concluido parcial: PROV-001 (preservacao de `toolCallId/toolName` no fluxo de `toolResult`)
- concluido parcial: PROV-001 (normalizador unico de `tool_call` em Anthropic/OpenAI/Gemini/Bedrock)
- concluido: PROV-101 (informacao de limites por provider/model via `getModelLimits`)
- concluido: PROV-101 (catalogo e classificacao de modelos via `listModelCatalog` + `resolveModelLimits`)
- concluido: CORE-001 (abstracao universal com `ProviderRegistry` + resolucao por modelo + capacidades)
- concluido parcial: PROV-001 (camada Anthropic com recursos avancados do SDK expostos no provider)
- concluido parcial: PROV-002 (embeddings implementados no `OpenAIProvider`)
- concluido parcial: PROV-002 (embeddings implementados no `BedrockProvider`)
- concluido parcial: CORE-102 (testes automatizados para normalizacao/provider e seguranca de paths/patterns)
- concluido: ARCH-301 (mapeamento multi-repo e gap analysis consolidado em `MAPEAMENTO_MULTI_REPOS_FUNCIONALIDADES.md`)
- concluido parcial: DEVOPS-201 (Release GitHub automatizado com artifacts por tag)
- pendente externo: DEVOPS-202 (publicacao em GitHub Packages depende de alinhamento de scope `@omni-agent/*` x owner `jcafeitosa`; pipeline ja faz skip seguro com diagnostico)
- concluido parcial: ROUTE-001 (roteador `ModelRouter` com fallback provider/modelo + integracao de cooldown)
- concluido parcial: ROUTE-001 (integracao de runtime via `RoutedProvider` e CLI com prioridade de providers)
- concluido: AUTH-001 (fluxos OAuth `pkce`, `authorization_code` e `device_code` no core)
- concluido: AUTH-002 (refresh e store `auto|keyring|file` operacionais com `OAuthManager`)
- concluido: AUTH-003 (identidade de CLI e registro default para `codex`, `claude-code`, `cursor`, `gemini-cli`)
- concluido: POL-001 (policy engine declarativo por regras/prioridade para turn/tool + prefix policy DSL para comandos shell)
- concluido parcial: AGENT-001 (budget `maxCostUsd` e politicas por agente no `AgentManager`/`AgentLoop`)
- concluido: MCP-201 (bridge MCP com resources/prompts + read/get)
- concluido: ROUTE-001 (selecao automatica priorizando OAuth + default model + latest/cheapest para API providers)
- concluido parcial: AGENT-101 (orquestracao de tasks com dependencias/paralelo/background no `AgentOrchestrator`)
- concluido parcial: AGENT-201 (gerenciamento de subagentes via `subagent` com acoes `start/status/list/cancel/wait/plan`)
- concluido parcial: PLUGIN-201 (carregamento e injecao de contexto de skills via `SkillManager`)
- concluido parcial: AGENT-101 (estado compartilhado colaborativo entre tasks + handoff por dependencias)
- concluido parcial: AGENT-201 (restricao de spawn por `allowedAgents` e eventos de ciclo de vida de subagentes/tasks)
- concluido parcial: PLUGIN-201 (hot-reload de skills e descoberta multi-diretorio)
- concluido: AGENT-101 (isolamento `worktree` para tasks e ciclo de vida completo de task manager)
- concluido: AGENT-201 (execucao cross-process de task via `externalCommand`)
- concluido: PLUGIN-201 (runtime de plugins com install/enable/disable/update e manifests)
- concluido: PLUGIN-201 (semantica de frontmatter de skills: agent/context/allowed-tools/hooks/user-invocable)
- concluido: CORE-102 (suite de testes do `@omni-agent/core` integrada ao `npm test` da raiz)
- concluido: AGENT-201 (compatibilidade de frontmatter e ferramentas para agentes em formato CLI generico)
- concluido: PLUGIN-201 (desambiguacao de skills por escopo `skill@scope` para evitar colisoes)
- concluido: MCP-201 (WebMCP com notificacoes `list_changed` para tools/resources/prompts via SSE)
- concluido: AGENT-201 (evento `task_notification` correlacionado por `tool_use_id` para subagents/tasks)
- concluido: CORE-101 (Query API com `close()` e `promptSuggestion()` para UX programatica)
- concluido: POL-001 (permission suggestions em respostas de deny para integracao com UI/CLI)
- concluido: MCP-201 (gerenciamento de MCP servers via status/toggle/reconnect no runtime de tools)
- concluido: ROUTE-001 (roteamento effort-aware com capacidades `supportsEffort`/`supportsAdaptiveThinking`)
- concluido: AUTH-201 (multi-sessao OAuth por vendor com balanceamento de contas, estrategias e consciencia de rate limit por conta)
- concluido: CORE-101 (structured output no `AgentLoop` com validacao Zod e erro estruturado)
- concluido: CORE-101 (metadata de resposta `request_id/provider/model` propagada em eventos `text/result`)
- concluido: MCP-201 (helpers de resources/prompts/read/get no `McpServerManager` + facade `McpHelpers`)
- concluido: CORE-102 (ToolRunner com `maxIterations`, `withResponse` e suporte a `AbortSignal`)
- concluido: CORE-102 (`AgentLoop` com `toolRunnerMode=provider_native` e contrato opcional `runToolsNative`)
- concluido: AGENT-101 (MemoryStore persistente e pesquisavel para memoria de sessao/projeto)
- concluido: PROV-001 (suporte a blocos `document/citation/code_execution` no modelo interno e compaction)
- concluido: CORE-102 (observabilidade minima por etapa do loop com `EventLogStore` JSONL e `OTelLiteManager`)
- concluido: CORE-001 (validacao tipada de eventos de protocolo `request_user_input` e `plan_update`)
- concluido: CORE-102 (processador `EventJsonlProcessor` para parse/filtro/sumario de telemetria JSONL)
- concluido: POL-101 (managed policy hierarchy por tier com precedencia `builtin/workspace/user/admin/enterprise`)
- concluido: PLUGIN-202 (catalogo de distribuicao de plugins com install por catalogo/versionamento)
- concluido: GOV-101 (workspace trust gating com `WorkspaceTrustManager` e enforcement no `PermissionManager`)
- concluido: GOV-102 (admin controls para `strict mode`, `extensions`, `mcp` e allowlist de MCP servers/tools)
- concluido: GOV-103 (policy integrity hash por escopo com `PolicyIntegrityManager`)

## P0 (bloqueante de sistema)

- CORE-001: contrato unico de eventos e tipos de erro
- CORE-002: fluxo de interrupcao e `plan` mode deterministico
- TOOLS-001: hardening de `bash` com limites e auditoria
- TOOLS-002: hardening de `fs/edit` com validacao de path
- PROV-001: normalizacao de tool-calling em todos providers principais
- PROV-002: matriz de embeddings por provider (OpenAI/Gemini/Bedrock nativo; Anthropic via provider dedicado)
- AGENT-001: politicas por agente (budget/max turns/allow deny)
- RETR-001: indexacao com metadado de versao e invalidez de indice
- AUTH-001: broker OAuth universal por provider
- AUTH-002: credential store `auto|keyring|file` com fallback
- AUTH-003: perfis de identidade de cliente para OAuth (`codex`, `claude-code`, `cursor`, `gemini-cli`)
- POL-001: policy engine declarativo por regra/prioridade/modo
- ROUTE-001: roteamento de modelo com fallback por indisponibilidade/quota

## P1 (robustez de producao)

- CORE-101: padrao de resposta estruturada para tools
- CORE-102: observabilidade minima por etapa de loop
- TOOLS-101: testes de regressao por tool critica
- PROV-101: retries/backoff padrao
- PROV-102: matriz de compatibilidade provider x recurso
- AGENT-101: telemetria de delegacao/paralelismo
- MCP-101: webmcp multi-cliente com testes de concorrencia
- MCP-201: discovery de MCP resources/prompts alem de tools
- AGENT-201: subagents remotos (A2A) com governanca de permissoes
- PLUGIN-201: runtime de plugins/skills com manifesto e distribuicao
- DEVOPS-201: pipeline de release/publicacao com estrategia de versionamento automatizada
- DEVOPS-202: estrategia de distribuicao de pacotes (scope/owner para GitHub Packages ou npmjs)

## P2 (otimizacao)

- RETR-201: chunking semantico avancado
- CLI-201: melhorias de UX para sessoes longas
- MCP-201: guia de integracao para clientes MCP externos
- DX-201: templates de agentes por dominio

## Definicao de pronto por item

- codigo implementado + testes cobrindo sucesso/erro/regressao
- documentacao tecnica atualizada
- sem alerta critico de seguranca no escopo do item
- validacao manual basica registrada

## Ordem de execucao recomendada

1. CORE-001
2. TOOLS-001
3. TOOLS-002
4. PROV-001
5. PROV-002
6. AGENT-001
7. RETR-001
8. MCP-101
9. AUTH-001
10. AUTH-002
11. AUTH-003
12. POL-001
13. ROUTE-001
