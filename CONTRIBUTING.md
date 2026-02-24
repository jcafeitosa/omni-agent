# Contributing to Omni Agent

## Prerequisites

- Node.js 18+
- npm 9+

## Development Setup

```bash
npm install
npm run build
npm test
```

## Branching and Commits

- Branch naming: `feat/...`, `fix/...`, `docs/...`, `refactor/...`, `chore/...`.
- Keep commits focused and atomic.
- Prefer conventional commit style:
  - `feat(core): add provider model manager`
  - `fix(providers): handle llama.cpp startup timeout`

## Pull Requests

- Open PRs against `main`.
- Include problem statement, solution summary, and risk notes.
- Add/adjust tests for behavioral changes.
- Update docs when changing contracts, flags, or APIs.

## Quality Gates

A PR is mergeable when all are true:

- `npm run build` passes.
- `npm test` passes.
- No unaddressed breaking change without migration notes.
- Relevant docs updated.

## Security-Sensitive Changes

For auth, provider routing, sandbox, and tool execution changes:

- Document threat model impact in PR description.
- Include negative tests for unsafe paths/inputs.
