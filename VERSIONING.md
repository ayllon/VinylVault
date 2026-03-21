# Versioning Strategy

VinylVault uses **Calendar Versioning**: `YEAR.MONTH.PATCH`.

## Version Format

- **Version**: `YEAR.MONTH.PATCH` (e.g., `2026.3.0`)
- Stored in two places that must always be in sync:
  - `app/src-tauri/Cargo.toml`
  - `app/src-tauri/tauri.conf.json`

> `app/package.json` is not authoritative and does not need to match.

CI enforces that the two sources above agree before any build or release proceeds.

## Release Workflow

Releases are fully automated. You never create tags or edit version numbers by hand.

### To cut a release

1. Go to **Actions → Tag and version bump → Run workflow** on GitHub.
2. Click **Run workflow**. No inputs required.

The workflow will:
1. Read the current version from `app/src-tauri/Cargo.toml`.
2. Fail early if a tag for that version already exists.
3. Create and push the tag `v<version>` (e.g. `v0.1.0`), which triggers the release pipeline.
4. Bump the patch segment and commit `chore: bump version to X.Y.Z [skip ci]` back to `main`.

### What the release pipeline does

The `release.yml` workflow fires automatically when a `v*` tag is pushed:

1. **Test gate** — verifies:
   - The tag matches the version in `Cargo.toml`.
   - `Cargo.toml` and `tauri.conf.json` versions are identical.
   - ESLint, TypeScript type-check, and Rust tests all pass.
2. **Build** — compiles the app for Linux (`.rpm`) and Windows (`.exe`).
3. **Publish** — creates a GitHub Release for the tag and attaches the installers.

### Major / minor version bumps

The automated workflow always bumps the patch segment. For a minor or major bump, edit `Cargo.toml` and `tauri.conf.json` manually on `main` (keeping them in sync), then trigger the workflow as usual.
