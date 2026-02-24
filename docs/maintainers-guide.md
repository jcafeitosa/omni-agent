# Maintainers Guide

## Daily Maintenance

- Review CI failures and unblock high-severity regressions first.
- Triage new issues using labels: `bug`, `enhancement`, `security`, `docs`.
- Keep roadmap and backlog aligned with merged changes.

## PR Review Standards

- Require reproducible tests for bug fixes.
- Validate security impact for auth/provider/tooling changes.
- Reject scope creep in release-critical PRs.

## Release Hygiene

- Update `CHANGELOG.md` continuously.
- Run `npm run release:check` before tagging.
- Tag semantic versions only after CI green on `main`.

## Incident Response

- Security incidents: follow `SECURITY.md` private disclosure path.
- Production regressions: revert quickly, then ship patch release.
