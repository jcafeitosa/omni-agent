# Multi-Agent Communication API

`@omni-agent/core` now exposes an initial communication runtime for multi-agent collaboration with workspace/channel/thread semantics.

## Current runtime (v1)

File:

- `packages/core/src/state/agent-communication.ts`

Main class:

- `AgentCommunicationHub`

Core features:

- workspace isolation (`ensureWorkspace`)
- agent identity registration (`registerAgent`)
- channel creation by type:
  - `general`
  - `team`
  - `department`
  - `project`
  - `private`
  - `dm`
  - `incident`
- membership management (`joinChannel`)
- message posting with:
  - thread support (`threadRootId`)
  - mention parsing (`@agent`, `@team:<name>`, `@department:<name>`, `@channel`)
  - delivery-plan resolution (`recipients`)
- reactions (`addReaction`)
- channel visibility resolution (`listChannelsForAgent`)
- textual search by workspace/channel/thread/sender (`searchMessages`)
- deterministic event replay (`applyEvent`)

## Access model (v1)

- `owner` and `admin` can access/post all channels.
- `general` is workspace-wide.
- `team` requires `agent.team === channel.team`.
- `department` requires `agent.department === channel.department`.
- `private`/`dm` require explicit membership.
- gestão de canal (`updateChannel`, `deleteChannel`) permitida para `owner`, `admin` ou criador do canal.

## Persistence (v1)

Files:

- `packages/core/src/state/agent-communication-store.ts`
- `packages/core/src/state/agent-communication-event-log.ts`

Components:

- `AgentCommunicationStore`: snapshot JSON persistence (`loadInto`, `saveFrom`)
- `AgentCommunicationEventLog`: append-only JSONL event log (`append`, `readAll`, `replayInto`, `compact`, `exportJsonl`)

Replay model:

- snapshot stores `lastEventSeq`
- runtime loads snapshot first, then replays event-log delta (`seq > lastEventSeq`)
- enables crash-safe incremental recovery without full event replay on every startup
- replay is fail-tolerant by default (`continueOnError=true`) and reports `{ applied, failed, lastSeq }`

Compaction model:

- retention by time window (`retentionDays`)
- truncation by maximum number of entries (`maxEntries`)
- malformed lines are skipped during parsing and removed on compaction rewrite

## Session routing helper

File:

- `packages/core/src/state/session-routing.ts`

Functions:

- `buildAgentMainSessionKey(agentId)`
- `buildAgentPeerSessionKey({ agentId, channel, accountId, peer, dmScope, identityLinks })`

`dmScope` values:

- `main`
- `per-peer`
- `per-channel-peer`
- `per-account-channel-peer`

Supports identity collapse across channels using `identityLinks`.

## Realtime gateway (v1)

File:

- `packages/core/src/state/agent-communication-realtime.ts`

Component:

- `AgentCommunicationRealtimeGateway`
  - `bindHub(hub)` para assinar eventos de domínio do `AgentCommunicationHub`
  - `subscribe(filter, onEvent)` para pub/sub em memória por `workspaceId`/`channelId`
  - `attachSseClient(req, res, filter)` para stream SSE (`text/event-stream`)
  - `toSse(event)` para serialização do payload SSE

Notas:

- Esta fase entrega stream realtime em memória + interface SSE pronta para acoplamento em servidor HTTP.
- Para operação multiprocesso, o CLI também expõe `comm watch-events` (follow por polling do event-log).

## Team + Orchestrator channel governance (v1)

Arquivos:

- `packages/core/src/state/agent-orchestrator.ts`
- `packages/core/src/state/agent-communication.ts`

Capacidades:

- O orquestrador pode fazer CRUD de canais de comunicação (`createCommunicationChannel`, `updateCommunicationChannel`, `deleteCommunicationChannel`).
- Criação de time (`createTeam`) cria automaticamente canal temporário privado e adiciona participantes.
- Participantes do time interagem no canal do time e no canal principal.
- Desfazer time (`disbandTeam`) remove o canal temporário.
- Política obrigatória: tarefas só executam com canal principal configurado para comunicação do orquestrador.

## Heartbeat runtime

File:

- `packages/core/src/state/heartbeat-service.ts`

`HeartbeatService` features:

- auto-creates `HEARTBEAT.md` template
- scheduled checks (`start`, `stop`)
- immediate execution (`executeNow`)

## Next increments

- storage hardening (retention, compaction, corruption recovery)
- real-time event stream for channel subscribers
- search index and retention policy
- audit/event compliance layer
- orchestration integration for team-level handoff and task collaboration
