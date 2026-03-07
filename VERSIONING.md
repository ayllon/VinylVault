# Versioning Strategy

VinylVault uses semantic versioning with build ID suffixes for CI builds.

## Version Format

- **Base version**: `MAJOR.MINOR.PATCH` (e.g., `0.1.0`)
  - Stored in repository in:
    - `app/src-tauri/tauri.conf.json`
    - `app/src-tauri/Cargo.toml`
    - `app/package.json`
  
- **CI build version**: `MAJOR.MINOR.BUILDID` (e.g., `0.1.20260307`)
  - Patch version is replaced with the build ID
  - Used for automated builds to enable upgrades
  - Build ID format: `YYYYMMDD` (date of build)

## Usage

### Manual Local Builds

For local development builds, the base version is used as-is. No action needed.

### CI Builds

The CI pipeline automatically appends a build ID to the version:

1. The `release.yml` workflow generates a build ID using the current date
2. Runs `./scripts/update-version.sh BUILDID` to update all version files
3. Builds the app with the versioned files

### Updating Version Manually

To test versioning locally:

```bash
# Show current version
./scripts/update-version.sh

# Update to a specific build version
./scripts/update-version.sh 20260307

# Revert changes
git checkout app/src-tauri/tauri.conf.json app/src-tauri/Cargo.toml app/package.json
```

## Package Manager Compatibility

- **Debian (.deb)**: Supports version format `0.1.20260307` natively
- **Windows MSI (.msi)**: Accepts three-part version numbers

This ensures that:
- Users can upgrade from CI builds to newer CI builds
- Each CI build has a unique, sortable version number based on date
- Package managers correctly identify newer versions
