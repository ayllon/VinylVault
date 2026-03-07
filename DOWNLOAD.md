# Download VinylVault

## Nightly Builds

Automated builds are created on every push to the main branch and published as a "nightly" release.

### Stable Download URLs

**Linux (Debian/Ubuntu):**
```bash
wget https://github.com/ayllon/VinylVault/releases/download/nightly/vinylvault_amd64.deb
sudo dpkg -i vinylvault_amd64.deb
```

**Windows:**

Download the installer directly:
- [vinylvault_x64_en-US.msi](https://github.com/ayllon/VinylVault/releases/download/nightly/vinylvault_x64_en-US.msi)

Or using PowerShell:
```powershell
Invoke-WebRequest -Uri "https://github.com/ayllon/VinylVault/releases/download/nightly/VinylVault_x64_en-US.msi" -OutFile "VinylVault.msi"
```

### View All Releases

Visit the [Releases page](https://github.com/ayllon/VinylVault/releases) to see all available versions and download links.

### Installation Notes

- The nightly builds are automatically versioned with a build ID (e.g., `0.1.26066`)
  - Format: `MAJOR.MINOR.BUILD_ID` where BUILD_ID = YY × 1000 + day_of_year
  - Example: For March 7, 2026 (day 66): version `0.1.26066`
- Package managers will correctly handle upgrades from older nightly builds
- These builds come from the main branch and should be stable, but may include recent changes

### Uninstallation

**Linux:**
```bash
sudo apt remove vinylvault
```

**Windows:**

Use "Add or Remove Programs" in Windows Settings, or:
```powershell
msiexec /x VinylVault.msi
```
