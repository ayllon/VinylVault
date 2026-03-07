# VinylVault – Project Guidelines

Desktop music-collection manager: a Tauri 2 app with a React/TypeScript frontend and a Rust/SQLite backend. The app is a modern rewrite of a legacy Microsoft Access database called "Registro Musical".

## Architecture

| Area | Path | Notes |
|------|------|-------|
| Frontend | `app/src/` | Single-page React app, all UI in `App.tsx` |
| Tauri/Rust | `app/src-tauri/src/lib.rs` | All IPC commands and DB logic |
| Config | `app/src-tauri/tauri.conf.json` | App identifier, CSP, window settings |
| Data | `data/` | Runtime SQLite DB + cover images in `covers/` |
| Migration | `scripts/mdb2sqlite.py` | One-time MDB → SQLite converter |

**Data flow:** Frontend invokes Tauri commands via `@tauri-apps/api` → Rust opens SQLite via `rusqlite` (bundled, no system SQLite needed) → returns serialised JSON.

## Build and Test

All commands run from `app/`:

```bash
npm install               # install JS deps
npm run dev               # Vite dev server only (http://localhost:5173)
npm run tauri -- dev      # full Tauri dev window (starts Vite automatically)
npm run build             # tsc -b && vite build (frontend only)
npm run tauri -- build    # full native bundle (deb/msi)
npm run lint              # ESLint flat config
```

Rust is compiled by the Tauri CLI; no separate `cargo build` step is needed for normal development.

## Conventions

### Communication
- For now, prefer Spanish messages in user-facing text unless the user explicitly asks for English.

### Frontend (TypeScript / React)
- **TypeScript strict mode** is on; no unused variables or parameters allowed.
- **Plain CSS** only — no Tailwind, no CSS modules. Styles live in `App.css` and `index.css`.
- **No component splitting yet** — the entire UI is in `App.tsx`. Keep additions in-file unless the component becomes clearly self-contained.
- Use `react-select` (v5) for searchable dropdowns; already wired up.
- Auto-save on field blur (`onBlur` → `invokeUpdate`); avoid saving on every keypress.

### Rust / Tauri
- All Tauri commands are in `lib.rs`, exposed with `#[tauri::command]`.
- Use raw `rusqlite` SQL — no ORM. Queries use named params (`?1`, `?2`, …).
- The `discos` table uses SQLite `rowid` as its implicit primary key (`id: i64`); never add an explicit `INTEGER PRIMARY KEY` column.
- Column names in the database are **Spanish/uppercase**: `GRUPO`, `TITULO`, `FORMATO`, `ANIO`, `ESTILO`, `PAIS`, `CANCIONES`, `CREDITOS`, `OBSERV`. Keep this naming in all SQL queries.
- Indexes on `GRUPO` and `TITULO` already exist; rely on them for search queries.

### Cover Images
- Stored at `data/covers/<2-char-prefix>/<sanitized-title>_cd.jpeg` and `..._lp.jpeg`.
- The Tauri `assetProtocol` scope is `["**"]`; serve images via `asset://` protocol URLs.
- CSP allows `img-src 'self' asset: https://asset.localhost data:`.

### Data Migration (Python)
- `scripts/mdb2sqlite.py` targets Python ≥ 3.12; dependencies in `pyproject.toml` (`tqdm`, `Pillow`).
- Run migration: `mdb-export <mdb> discos -b hex | python scripts/mdb2sqlite.py <csv> <sqlite>`.

## Potential Pitfalls

- **DB path is not persisted** — the user selects the `.sqlite` file via a dialog every session. No path is saved in app state between launches.
- **Dev URL port** — `tauri.conf.json` hardcodes `http://localhost:5173`; if Vite picks a different port, update `devUrl` there.
- **Window min-size** — window is fixed at 1200×800 minimum; don't design UI that requires less width.
- **`npm run tauri -- dev`** — note the `--` separator; `npm run tauri dev` (without `--`) won't work.
- **Rust toolchain** — requires `rustup default stable` and platform build tools (see Tauri prerequisites docs).
- **`rusqlite` bundled** — SQLite is statically linked; no system SQLite dependency, but build requires a C compiler.
