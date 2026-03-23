# VinylVault / Registro Musical

Desktop music-collection manager built with a React + TypeScript frontend and a Tauri 2 + Rust backend.

This project is a modern rewrite of the legacy Microsoft Access app "Registro Musical".

## Download & Install

For end users, see [DOWNLOAD.md](DOWNLOAD.md) for installation instructions and release links.

Releases are published on GitHub from version tags (`v*`) and currently include:
- Linux `.rpm`
- Windows `.exe`

Project releases page:
- https://github.com/ayllon/VinylVault/releases

## Repository Layout

- `app/`: Frontend app workspace (Vite + React + TypeScript)
- `app/src/`: Frontend source code
- `app/src-tauri/`: Tauri configuration and Rust backend
- `.github/workflows/`: CI and release pipelines

## Prerequisites

- Node.js 22.x and npm
- Rust stable toolchain (`rustup default stable`)
- Tauri system prerequisites for your platform: https://tauri.app/start/prerequisites

## Development

Run all commands from `app/` unless noted.

1. Install dependencies

```bash
cd app
npm install
```

2. Frontend-only development server

```bash
npm run dev
```

3. Full desktop app in development mode

```bash
npm run tauri -- dev
```

The Tauri dev window loads from `http://localhost:5173` (configured in `app/src-tauri/tauri.conf.json`).

## Build

1. Build frontend assets

```bash
cd app
npm run build
```

2. Build native installer/bundle

```bash
cd app
npm run tauri -- build
```

## Useful Commands

From `app/`:

- `npm run dev`: Start Vite dev server
- `npm run build`: Run `tsc -b` and `vite build`
- `npm run lint`: Run ESLint
- `npm run preview`: Preview built frontend
- `npm run tauri -- dev`: Run the Tauri app in dev mode
- `npm run tauri -- build`: Build native bundles

From `app/src-tauri/`:

- `cargo test --workspace --all-features`: Run Rust tests

## Runtime Data Location

At runtime, the app database and cover assets are not stored in this repository.

- Default DB path: `$HOME/discos/discos.sqlite`
- Override DB path with: `VINYLVAULT_DB_PATH`
- Cover images are stored relative to the DB directory under `covers/`

## Notes

- The desktop window title in Tauri config is currently `Registro Musical`.
- Frontend localization uses i18next with Spanish and English. See [I18N_GUIDE.md](I18N_GUIDE.md).

## Troubleshooting

- If `npm run tauri -- dev` fails, verify Rust/toolchain prerequisites and platform libraries.
- If the frontend starts on a different port, either run Vite on `5173` or update `devUrl` in `app/src-tauri/tauri.conf.json`.
- If release builds fail, ensure versions match in `app/src-tauri/Cargo.toml` and `app/src-tauri/tauri.conf.json`.
