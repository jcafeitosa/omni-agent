# TASKS

Use este arquivo como backlog operacional.

## Todo
- [ ] [comm-epic-storage] Implementar persistência durável do `AgentCommunicationHub` (snapshot + append-only log + compaction/retention) #communication #storage #event-sourcing
- [ ] [comm-epic-realtime] Expor gateway real-time (SSE/WebSocket) para eventos de canal/thread/presence #communication #gateway
- [ ] [comm-epic-search] Implementar indexação e busca full-text de mensagens por workspace/canal/thread/agente #communication #search
- [ ] [comm-epic-notify] Implementar serviço de notificação com regras por prioridade, menções e modo do agente #communication #notification
- [ ] [comm-epic-audit] Implementar trilha de auditoria imutável com retenção e export #communication #audit #governance
- [ ] [comm-epic-files] Implementar anexos/snippets/pins e metadados de arquivo por mensagem #communication #files
- [ ] [comm-epic-rbac-abac] Estender ACL para RBAC + ABAC com policy por tags e sensibilidade #communication #security #policy
- [ ] [comm-epic-orchestrator] Integrar canais com `AgentOrchestrator` para handoff, votação e coordenação paralela #communication #orchestration
- [ ] [comm-epic-dm] Implementar canais DM e multi-DM com roteamento por escopo e isolamento #communication #dm
- [ ] [comm-epic-presence] Implementar PresenceService completo com heartbeat, estados e SLA por agente #communication #presence
- [ ] [comm-epic-e2e] Criar suíte E2E para colaboração multi-agent (geral/time/departamento/thread) #communication #testing

## In Progress
- [ ] [comm-epic-storage-hardening] Adicionar retenção/compaction e recuperação robusta em falha parcial de snapshot/event-log #communication #storage #resilience
- [ ] [comm-epic-realtime-websocket] Adicionar transporte WebSocket e integrar gateway realtime no pacote webmcp #communication #gateway #websocket

## Blocked
- [ ] [comm-ui-v1] Construir interface visual de canais/thread/presença para operação humana #communication #ui

## Done
- [x] [comm-plan-initial] Definir arquitetura alvo com paridade de recursos de mensageria tipo Slack #communication #architecture
- [x] [comm-core-v1] Estruturar núcleo de comunicação multi-agent no `@omni-agent/core` (channels/messages/threads/mentions/reactions) #communication #core
- [x] [comm-docs-v1] Documentar contrato da API de comunicação multi-agent e plano de entrega #communication #docs
- [x] [comm-epic-cli] Adicionar comandos `omni comm ...` para administrar workspaces, canais, membros e mensagens #communication #cli
- [x] [comm-epic-storage-v1] Implementar persistência snapshot + append-only log JSONL com replay incremental por `lastEventSeq` #communication #storage #event-sourcing
- [x] [comm-epic-search-v1] Disponibilizar busca textual inicial no runtime e CLI (`search-messages`) e evoluir para índice dedicado #communication #search
- [x] [comm-epic-storage-hardening-v1] Adicionar compaction por retenção/limite de eventos, export JSONL e replay tolerante a falha #communication #storage #resilience
- [x] [comm-epic-realtime-v1] Implementar pub/sub em memória + SSE gateway no core e `watch-events` no CLI #communication #gateway
- [x] [comm-orchestrator-channel-governance-v1] Orquestrador com comunicação obrigatória no canal principal + CRUD de canais + times com canal temporário e teardown automático #communication #orchestration #channels
