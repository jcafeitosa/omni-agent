# Plano de Execucao 90 Dias

Objetivo: concluir a base de sistema completo do Omni Agent com foco em confiabilidade operacional, seguranca e previsibilidade de entrega.

## Premissas

- janela: 12 semanas
- cadencia: 6 sprints de 2 semanas
- priorizacao: P0 (bloqueante de sistema), P1 (robustez), P2 (otimizacao)

## Metas por fase

## Fase 1 (Semanas 1-4) - Fundacao de producao

- padronizar contratos de eventos/erros no core
- endurecer runtime de tools (shell/edit/fs)
- garantir suite minima de regressao automatizada em core/tools
- iniciar fundacao de autenticacao universal (OAuth broker + storage)

## Fase 2 (Semanas 5-8) - Convergencia multivendor e multiagente

- normalizar tool-calling entre providers
- completar embeddings nos providers pendentes
- implementar politicas por agente (budget/max turns/allow deny tools)
- implementar policy engine declarativo e roteamento/fallback de modelos

## Fase 3 (Semanas 9-12) - Operacao e escala

- maturar retrieval/indexacao com metadados e invalidez
- fortalecer webmcp para multi-cliente
- fechar baseline de observabilidade e readiness de release

## Sprints

## Sprint 1

- P0: contrato unico de eventos (`text/tool_use/tool_result/status/result/hook`)
- P0: padrao unico de erro de tool e erro de provider
- P0: testes de regressao de loop (happy path, erro, interrupcao, plan mode)
- entrega: especificacao de contratos + testes verdes

## Sprint 2

- P0: hardening de `bash` (controles de timeout/process tree/saidas)
- P0: hardening de `fs` e `edit` (validacao de path e limites)
- P1: resposta estruturada comum para todas as tools
- P0: AUTH-001/AUTH-002 (broker OAuth + credential store `auto|keyring|file`)
- entrega: runtime de tools com seguranca e padrao de resposta

## Sprint 3

- P0: normalizacao do tool-calling para Anthropic/OpenAI/Gemini/Bedrock
- P0: correcoes de mapping `toolResult` por provider
- P1: matriz de compatibilidade provider x recurso
- P0: AUTH-003 (identidade CLI para codex/claude-code/cursor/gemini-cli)
- entrega: comportamento coerente entre providers

## Sprint 4

- P0: embeddings para providers pendentes
- P1: retries/backoff padrao em chamadas de provider
- P1: testes de carga basicos em chamadas de inferencia/embedding
- P0: ROUTE-001 (fallback/routing de modelos por disponibilidade)
- entrega: camada provider completa para operacao

## Sprint 5

- P0: politicas por agente (budget/max turns/allow deny)
- P1: telemetria de delegacao e parallel delegate
- P1: auditoria de hooks por evento
- P0: POL-001 (policy engine declarativo por regra, prioridade e modo)
- entrega: governanca multiagente com rastreabilidade

## Sprint 6

- P0: indexacao/retrieval com metadados de versao e invalidez
- P1: webmcp multi-cliente com testes de concorrencia basicos
- P1: checklist de release com gates de qualidade
- P1: MCP-201 (resources/prompts no bridge MCP)
- entrega: baseline de sistema completo pronto para ciclos continuos

## Gates de qualidade (obrigatorios por sprint)

- build green em todos os workspaces
- testes de unidade e regressao relevantes verdes
- atualizacao de documentacao de contrato alterado
- changelog tecnico interno da sprint
- sem regressao critica aberta (sev1/sev2)

## Riscos principais e mitigacao

- divergencia de comportamento entre providers
- mitigacao: suite de conformidade com cenarios iguais entre vendors

- regressao de seguranca em tool runtime
- mitigacao: testes de seguranca + regras de path + limites de execucao

- crescimento descontrolado do escopo
- mitigacao: congelamento de sprint e entrada de escopo via triagem P0/P1/P2
