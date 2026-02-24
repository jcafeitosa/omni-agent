# Observability and Protocol Events

`@omni-agent/core` now includes runtime observability primitives and typed protocol-event validation.

## Runtime observability

- `EventLogStore` (`packages/core/src/state/event-log-store.ts`)
  - batched append to event log
  - retention compaction
  - JSONL export and graceful shutdown flush
- `OTelLiteManager` (`packages/core/src/events/otel-lite.ts`)
  - counters and histograms with tags
  - in-memory snapshot for export/integration
- `EventJsonlProcessor` (`packages/core/src/events/event-jsonl-processor.ts`)
  - parse JSONL content/file to typed entries
  - filter by type/subtype/thread/time window
  - summarize event volumes by type and subtype
- `summarizeTurnCosts` and `estimateUsageCostUsd` (`packages/core/src/events/cost-analytics.ts`)
  - pricing-based cost estimates from `turn_completed` events
  - per-provider/per-model rollups
  - configurable default and per-provider/model rates
- `transcriptFromMessages`, `transcriptFromEvents`, `transcriptToMarkdown` (`packages/core/src/events/session-transcript.ts`)
  - normalize message/event streams into transcript entries
  - export transcript as Markdown

## Typed protocol events

- `parseRequestUserInputPayload` and `parsePlanUpdatePayload`
  - validate payload contract with Zod
  - drop invalid payloads before re-emitting to SDK stream
- `AgentLoop.emitRequestUserInput(...)` and `AgentLoop.emitPlanUpdate(...)`
  - use validation layer before event bus dispatch
  - emit operational status warning when payload is invalid

## Public exports

From `@omni-agent/core`:

- `EventLogStore`
- `OTelLiteManager`
- `EventJsonlProcessor`
- `summarizeTurnCosts`
- `estimateUsageCostUsd`
- `transcriptFromMessages`
- `transcriptFromEvents`
- `transcriptToMarkdown`
- `parseRequestUserInputPayload`
- `parsePlanUpdatePayload`

## Operational scripts

- `npm run ops:cost-report -- --events <path/to/events.jsonl>`
- `npm run ops:export-transcript -- --input <path/to/session.json> --output <path/to/transcript.md>`
- `npm run ops:export-analytics -- --events <path/to/events.jsonl> --output <path/to/costs.csv> --format csv`

## CLI runtime persistence

- Interactive CLI supports `--session-file <path>` to auto-load and auto-save `AgentSession`.
- Interactive CLI supports `--event-log-file <path>` to persist runtime events in JSONL.
- `omni ops export-analytics --events <events.jsonl> --output <file> --format json|jsonl|csv`
