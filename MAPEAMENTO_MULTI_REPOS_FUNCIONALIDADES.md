# Mapeamento Multi-Repo para o Omni-Agent

Data de referencia: 2026-02-24

Objetivo: consolidar funcionalidades e recursos criticos observados em `claude-agent-sdk-typescript`, `claude-code`, `claude-code-security-review`, `codex`, `gemini-cli`, `knowledge-work-plugins`, `skills` e `pi-mono`, cruzando com o estado atual do `omni-agent`.

## 1) Autenticacao por pasta

| Pasta | Como autentica | Armazenamento/estado | Identidade de cliente (CLI) | Status no omni-agent |
|---|---|---|---|---|
| `codex` | OAuth browser callback local + device code + API key | `auth.json`/manager e keyring/file fallback para MCP OAuth | parametros como `originator`, `codex_cli_simplified_flow`, `client_id` fixo | parcial: falta broker OAuth e perfil Codex |
| `gemini-cli` | Login Google OAuth, Gemini API key, Vertex (ADC/service account/API key), MCP OAuth | cache local de credenciais + storage especifico | `client_id`/`client_secret` do CLI, headers e metadata de cliente | parcial: falta broker OAuth e perfil Gemini CLI |
| `claude-code` | auth login/status/logout (evolucao via changelog), API key e auth para MCP OAuth | suporte a refresh/cache (segundo changelog) | identidade do proprio `claude` CLI | parcial: falta broker OAuth e perfil Claude Code |
| `claude-agent-sdk-typescript` | herda fluxo do Claude Code/SDK | controlado pelo runtime SDK | n/a no repo espelho (sem implementacao local) | parcial: falta integracao de login/credenciais padronizada |
| `pi-mono` | broker OAuth multi-provider (Anthropic, Codex, Gemini CLI, Antigravity, Copilot) | registro de providers + refresh por provider | emula CLIs com headers, `originator`, scopes, redirects e client ids proprios | referencia principal para implementar no omni-agent |
| `claude-code-security-review` | `claude-api-key` + `GITHUB_TOKEN` no Action | env vars/CI | execucao via `claude` CLI | nao aplicavel ao core auth do omni-agent |
| `knowledge-work-plugins` | sem auth propria; depende de conectores MCP | configuracao em `.mcp.json` | n/a | parcial: falta camada de conectores padronizada |
| `skills` | sem auth propria | n/a | n/a | parcial: skill runtime existe, falta empacotamento/marketplace |

## 2) Funcionalidades relevantes por repo

## `codex`

- sandbox e politicas de aprovacao bem definidas (approval/sandbox prompts por modo).
- metadados ricos de modelos (reasoning effort, modalidades, truncation policy, parallel tool calls).
- MCP OAuth discovery (RFC 8414), classificacao de auth status e armazenamento seguro (keyring com fallback em arquivo).
- fluxos de login robustos (callback local, device code, workspace allowlist).

Impacto no omni-agent:
- atualizar core de politica/permissao para modelo em camadas e regras aprovadas por prefixo.
- adicionar store de credenciais com modo `auto|keyring|file`.

## `gemini-cli`

- policy engine com tiers (`default/workspace/user/admin`), prioridades e matching por `toolName`/args/comando.
- model routing com fallback automatico por disponibilidade.
- subagents locais e remotos (A2A), com registro em markdown + frontmatter.
- MCP completo: tools + resources, transportes `stdio/sse/http`, allow/exclude por ferramenta.
- matriz de autenticacao enterprise (OAuth, API key, Vertex ADC/SA/API key).

Impacto no omni-agent:
- implementar policy engine declarativo e roteamento de modelo por saude/erro/quota.
- ampliar MCP bridge para resources e politicas por servidor.

## `claude-code` / `claude-agent-sdk-typescript`

- ecossistema maduro de plugins (commands/agents/skills/hooks/.mcp.json).
- eventos/hooking avancado no SDK (task events, config change, permission hooks, mcp status rico).
- allowlist de tools built-in, session IDs custom, structured outputs, subagents programaticos.

Impacto no omni-agent:
- evoluir contratos de eventos/hook para equivalencia funcional de SDK.
- formalizar marketplace/formato de plugin nativo no projeto.

## `claude-code-security-review`

- pipeline pronto para auditoria de PR com diff awareness.
- filtro de falso positivo em 2 etapas (regras duras + modelo).
- customizacao por instrucoes externas.

Impacto no omni-agent:
- oportunidade de pacote `security-review` como agente/command oficial.

## `knowledge-work-plugins` + `skills`

- padrao de plugin e skill file-based altamente portavel.
- conectores tool-agnostic por categoria (`~~chat`, `~~project tracker` etc.).
- skill spec em markdown/frontmatter com scripts e referencias locais.

Impacto no omni-agent:
- consolidar formato oficial de plugin/skill para distribuicao entre times.

## `pi-mono`

- abstracao de providers madura (modelo, custo, uso, handoff cross-provider).
- catalogo de modelos gerado e API para consulta de providers/modelos.
- broker OAuth multi-provider com registro extensivel e refresh uniforme.
- implementacoes concretas que identificam o acesso como CLI original (headers/user-agent/client metadata/originator).

Impacto no omni-agent:
- base direta para fechar requisito de OAuth e identidade CLI multi-provider.

## 3) Matriz de paridade (omni-agent vs referencias)

| Capacidade | Estado atual | Atualizacao necessaria |
|---|---|---|
| Abstracao universal de providers/modelos | implementado (`Provider`, `ProviderRegistry`) | ampliar com `authProfile` e `model health/routing` |
| Limites e catalogo de modelos | implementado (`getModelLimits`, catalogo/classificacao) | sincronizar capacidades extras (reasoning tiers, modalities, truncation) |
| Normalizacao de tool-calling | implementado nos providers principais | manter testes de conformidade e cobrir edge-cases SDK |
| Embeddings multi-provider | parcial | fechar cobertura real por provider/modelo com detecao de suporte |
| OAuth broker multi-provider | ausente | implementar registro OAuth e fluxos por provider |
| Identidade de cliente como CLI oficial (Codex/Claude/Cursor/Gemini) | ausente | implementar perfis de identidade (headers/query/body/redirect/scopes) |
| Store de credenciais seguro (`auto/keyring/file`) | ausente | implementar camada de storage com fallback |
| Policy engine por regras | ausente | implementar engine declarativa com prioridade/tier/modo |
| Roteamento/fallback de modelo | ausente | implementar `ModelAvailabilityService` interno |
| Subagents remotos A2A | parcial (delegacao local) | adicionar suporte remoto e registro dinamico |
| MCP resources/prompts + tools | parcial (tools) | incluir discovery/read de resources e prompts |
| Plugin marketplace/packaging | parcial | padronizar manifesto/plugin install/update |

## 4) Plano de execucao recomendado

## P0 (iniciar agora)

1. `AUTH-001` Broker OAuth universal
2. `AUTH-002` Credential store `auto|keyring|file`
3. `AUTH-003` Perfis de identidade CLI (`codex`, `claude-code`, `cursor`, `gemini-cli`)
4. `POL-001` Policy engine declarativo (tool/cmd/args + prioridade + modos)
5. `ROUTE-001` Fallback de modelo por disponibilidade

## P1

1. `MCP-201` Resources/prompts no bridge MCP
2. `AGENT-201` Subagents remotos (A2A) + governanca
3. `PROV-201` Enriquecimento de catalogo/capabilities de modelos
4. `PLUGIN-201` Runtime/packaging de plugins e skills

## P2

1. `SEC-201` Pacote de security review estilo PR-audit
2. `OBS-201` Telemetria de auth/policy/routing por provider

## 5) Decisoes praticas para o requisito de OAuth com identidade CLI

1. Criar `OAuthProviderProfile` por provider com:
   - endpoints, client_id/redirect/scopes
   - formato de headers obrigatorios
   - parametros de query/body obrigatorios para se apresentar como CLI
2. Implementar `OAuthManager` desacoplado de provider de inferencia.
3. Implementar `CredentialStore` com strategy:
   - `auto`: keyring se disponivel, fallback arquivo
   - `keyring`: falha se indisponivel
   - `file`: forca arquivo
4. Atualizar `Provider` para aceitar `authResolver` central, nao tokens ad-hoc.
5. Adicionar testes de contrato por perfil (`codex`, `claude-code`, `gemini-cli`, `cursor`).

