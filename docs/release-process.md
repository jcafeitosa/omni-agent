# Release Process

## Versioning

- Follow semantic versioning: `MAJOR.MINOR.PATCH`.
- Update `CHANGELOG.md` under `[Unreleased]` during development.

## Cut a release

1. Ensure CI is green on `main`.
2. Move release notes from `[Unreleased]` to a versioned section in `CHANGELOG.md`.
3. Tag release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

4. GitHub Release workflow runs:
- build + test
- creates GitHub release notes
- attempts npm publish for workspaces

## Rollback

- If publish fails partially, deprecate affected npm versions and cut a patch release.
- If runtime regression is found, revert on `main` and release `PATCH+1`.
