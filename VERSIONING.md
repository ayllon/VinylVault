# Versioning Strategy

VinylVault uses semantic versioning with build ID suffixes for CI builds.

## Version Format

- **Base version**: `MAJOR.MINOR.PATCH` (e.g., `0.1.0`)
  - Stored in repository in:
    - `app/src-tauri/tauri.conf.json`
    - `app/src-tauri/Cargo.toml`
    - `app/package.json`
  
- **CI build version**: `MAJOR.MINOR.BUILDID` (e.g., `0.1.26066`)
  - Patch version is replaced with the build ID
  - Used for automated builds to enable upgrades
  - Build ID format: `YY * 1000 + day_of_year` (e.g., 26066 for day 66 of 2026)
  - This format stays under the 65535 limit required by Windows MSI and other package formats
  - Maximum value: 99365 (valid until year 2099)

## Usage

### Manual Local Builds

For local development builds, the base version is used as-is. No action needed.

### CI Builds

The CI pipeline automatically appends a build ID to the version:

1. The `release.yml` workflow generates a build ID using the current date
2. Runs `./scripts/update-version.sh BUILDID` to update all version files
3. Builds the app with the versioned files
4. Publishes artifacts to a GitHub Release tagged as "nightly"

**Stable download URLs:**
- Linux: `https://github.com/ayllon/VinylVault/releases/download/nightly/vinylvault_amd64.deb`
- Windows: `https://github.com/ayllon/VinylVault/releases/download/nightly/VinylVault_x64_en-US.msi`

See [DOWNLOAD.md](DOWNLOAD.md) for complete installation instructions.

### Updating Version Manually

To test versioning locally:

```bash
# Show current version
./scripts/update-version.sh

# Update to a specific build version (use YY*1000 + day_of_year format)
# For March 7, 2026 (day 66): 26 * 1000 + 66 = 26066
./scripts/update-version.sh 26066

# Or calculate it automatically:
./scripts/update-version.sh $(($(date +%y) * 1000 + 10#$(date +%j)))

# Revert changes
git checkout app/src-tauri/tauri.conf.json app/src-tauri/Cargo.toml app/package.json
```6066` natively
- **Windows MSI (.msi)**: Requires patch version ≤ 65535 (our format satisfies this)

This ensures that:
- Users can upgrade from CI builds to newer CI builds
- Each CI build has a unique, sortable version number based on date
- Package managers correctly identify newer versions
- Version numbers stay within the 65535 limit for all platform
This ensures that:
- Users can upgrade from CI builds to newer CI builds
- Each CI build has a unique, sortable version number based on date
- Package managers correctly identify newer versions
