# Maintainer Checklist

## Before merge

- [ ] Scope is aligned to roadmap/backlog.
- [ ] Build and tests pass.
- [ ] Security-sensitive changes include risk notes.
- [ ] Docs updated for new/changed behavior.

## Before release

- [ ] `CHANGELOG.md` updated.
- [ ] `npm run release:check` passes.
- [ ] Tag is semantic (`vMAJOR.MINOR.PATCH`).
- [ ] Release workflow succeeded.

## After release

- [ ] Validate package artifacts.
- [ ] Publish release notes summary to team.
- [ ] Track regressions for 24-48h.
