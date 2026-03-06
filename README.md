# VinylVault / Registro Musical

A desktop music-records manager built with a Vite + React (TypeScript) frontend and Tauri (Rust) backend for native packaging. The app window title shown in the Tauri config is "Registro Musical".

This project is a modern rewrite of a Microsoft Access application I built for my father in 2001 — he is still using the original, and the migration to a cross-platform native app has been long overdue.

## Contents

- `app/` — frontend (Vite + React + TypeScript) and Tauri frontend folder
- `app/src-tauri/` — Tauri configuration and Rust sources for the native app
- `data/` — local data, including `covers/` image folders
- `scripts/` — helper scripts (e.g. `mdb2sqlite.py`)

## Prerequisites

- Node.js (16+ recommended), `npm` or `pnpm`/`yarn`
- Rust toolchain (rustup + cargo) for Tauri native builds
- Tauri prerequisites (see https://tauri.app/v1/guides/getting-started/prerequisites)

## Development

1. Install frontend dependencies

```bash
cd app
npm install
```

2. Run the frontend dev server (Vite)

```bash
npm run dev
```

3. Run the Tauri app (native window) in dev mode

From `app/`, use the `tauri` script. This invokes the Tauri CLI; if you don't have the CLI globally installed, the script will still work via the project's devDependency:

```bash
cd app
npm run tauri -- dev
```

This opens the native window and loads the frontend from Vite's dev server (devUrl is configured as `http://localhost:5173`).

## Production build

1. Build the frontend (TypeScript + Vite)

```bash
cd app
npm install   # ensure deps installed
npm run build
```

2. Build the native Tauri bundle

```bash
cd app
npm run tauri -- build
```

The `tauri build` step reads `app/src-tauri/tauri.conf.json` which is configured to use `../dist` as the frontend output directory.

## Useful scripts

- `npm run dev` — start Vite dev server
- `npm run build` — run `tsc -b` then `vite build` for production frontend assets
- `npm run preview` — preview built frontend via Vite
- `npm run tauri -- <cmd>` — run Tauri CLI commands (e.g., `npm run tauri -- dev`, `npm run tauri -- build`)

## Notes about the repository

- Frontend code lives in `app/src/` (React + TypeScript).
- Tauri config and Rust sources are under `app/src-tauri/`.
- The top-level `data/covers/` directory contains album cover images organized in subfolders; `scripts/mdb2sqlite.py` contains utilities used for data conversion.

## Troubleshooting

- If Tauri CLI fails: ensure Rust toolchain is installed (`rustup default stable`) and that required platform toolchains are present. Consider installing the Tauri CLI globally with `npm i -g @tauri-apps/cli` or use the local script: `npm run tauri -- help`.
- If the frontend port is different, update `devUrl` in `app/src-tauri/tauri.conf.json` or run Vite on the configured port.

## Contributing

Open issues or pull requests with small, focused changes. For build issues, include OS and exact error output.

## License

If the project has a license, add it here. Otherwise, add a `LICENSE` file at the repo root.
