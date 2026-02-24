# Security Review and Finding Triage

`@omni-agent/core` includes a full security review pipeline with finding triage inspired by production CI workflows.

## Main APIs

- `runSecurityReview(options)` in `packages/core/src/security/security-review.ts`
- `FindingsFilter` in `packages/core/src/security/findings-filter.ts`
- `ResilientModelCalibrator` in `packages/core/src/security/findings-filter.ts`
- `RunReservationManager` in `packages/core/src/security/run-reservation.ts`
- `parseJsonWithFallbacks` in `packages/core/src/helpers/json-fallback-parser.ts`

## Security Review Flow

1. Collect changed files and git diff (`baseRef...HEAD`, with optional uncommitted changes).
2. Filter generated/excluded sections from diff.
3. Build security-focused prompt.
4. Call provider (`generateText`) and parse JSON with fallbacks.
5. Apply triage filter:
   - hard exclusion rules (deterministic)
   - optional model calibration (confidence based)
   - fail-open on calibration failures
6. Return findings + exclusion audit trail + summary stats.

## Slash Command

The loop registers `/security-review` by default.

Options:

- `--base=<ref>`: base ref for diff range
- `--exclude=dir1,dir2`: directories excluded from review
- `--no-model-filter`: disables model-based confidence filtering

Result behavior:

- returns `result:error` if at least one `HIGH` finding remains after filtering
- returns `result:success` when no `HIGH` findings remain

## Finding Triage

`FindingsFilter` output:

- `filteredFindings`: final findings kept
- `excludedFindings`: detailed exclusions with stage/reason/confidence
- `analysisSummary`: total, kept, excluded, average confidence, breakdown

## Run Reservation

`RunReservationManager` provides marker-based reservation to avoid concurrent duplicate runs:

- `acquire(...)`
- `markCompleted(...)`
- `markFailed(...)`
- stale marker takeover by TTL
