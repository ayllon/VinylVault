# Download VinylVault

## Release Channel

VinylVault is distributed through GitHub Releases.

- Releases are created from version tags (`v*`), not from a `nightly` tag.
- Current installers are:
  - Linux: `.rpm`
  - Windows: `.exe`

## Download

Open the releases page and download the installer for your platform:

- https://github.com/ayllon/VinylVault/releases

If you want the most recent release directly, open:

- https://github.com/ayllon/VinylVault/releases/latest

## Install

**Linux (RPM-based distributions such as Fedora/openSUSE/RHEL):**
```bash
sudo rpm -i <downloaded-file>.rpm
```

**Windows:**

Run the downloaded installer and follow the setup wizard.

## Notes

- Artifact filenames include the app version, so they change for each release.
- Use the latest release page when you need the current file names.

### Uninstallation

**Linux:**
```bash
sudo rpm -e vinylvault
```

**Windows:**

Use "Add or Remove Programs" in Windows Settings.
