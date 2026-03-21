# VinylVault – Project Guidelines

Desktop music-collection manager: a Tauri 2 app with a React/TypeScript frontend and a Rust/SQLite backend. The app is a modern rewrite of a legacy Microsoft Access database called "Registro Musical".

## Architecture

| Area | Path | Notes |
|------|------|-------|
| Frontend | `app/src/` | Single-page React app, all UI in `App.tsx` |
| Tauri/Rust | `app/src-tauri/src/lib.rs` | All IPC commands and DB logic |
| Config | `app/src-tauri/tauri.conf.json` | App identifier, CSP, window settings |
| Data | `$HOME/discos/` | Runtime SQLite DB (`discos.sqlite`) + cover images in `covers/`; override with `VINYLVAULT_DB_PATH` env var |
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

### Communication & i18n
- **All user-facing text must go through the i18n system** — never hardcode messages in the UI.
- The app supports **English (en)** and **Spanish (es)**, with Spanish as the default.
- **How to add translations:**
  1. Add the key to both `app/src/i18n/es.json` and `app/src/i18n/en.json`
  2. Use `const { t } = useTranslation()` in components
  3. Reference keys via `t('key.name')` or with interpolation: `t('key', { var: value })`
- **Translation structure:** Keys are organized hierarchically (e.g., `fields.group`, `actions.delete`, `search.by_album`)
- See `I18N_GUIDE.md` in the project root for detailed i18n documentation and examples.

### Frontend (TypeScript / React)
- **TypeScript strict mode** is on; no unused variables or parameters allowed.
- **Internationalization:** Uses `i18next` and `react-i18next` for multi-language support (ES/EN).
- **Plain CSS** only — no Tailwind, no CSS modules. Styles live in `App.css` and `index.css`.
- **No component splitting yet** — the entire UI is in `App.tsx`. Keep additions in-file unless the component becomes clearly self-contained.
- Use `react-select` (v5) for searchable dropdowns; already wired up.
- Auto-save on field blur (`onBlur` → `invokeUpdate`); avoid saving on every keypress.

### Rust / Tauri
- All Tauri commands are in `lib.rs`, exposed with `#[tauri::command]`.
- Use raw `rusqlite` SQL — no ORM. Queries use named params (`?1`, `?2`, …).
- The `albums` table uses SQLite `rowid` as its implicit primary key (`id: i64`); never add an explicit `INTEGER PRIMARY KEY` column.
- Column names are **English/lowercase**: `artist`, `title`, `format`, `year`, `style`, `country`, `tracks`, `credits`, `edition`, `notes`, `cd_cover_path`, `lp_cover_path`.
- Indexes on `artist` and `title` already exist; rely on them for search queries.

### Cover Images
- Stored relative to the DB directory: `covers/<2-char-prefix>/<sanitized-key>_<cd|lp>_<hash>.jpg`. The default DB directory is `$HOME/discos/`.
- The Tauri `assetProtocol` scope is `$HOME/discos/**`; serve images via `asset://` protocol URLs.
- CSP allows `img-src 'self' asset: https://asset.localhost http://asset.localhost data: https://coverartarchive.org`.

### Data Migration (Python)
- `scripts/mdb2sqlite.py` targets Python ≥ 3.12; dependencies in `pyproject.toml` (`tqdm`, `Pillow`).
- Run migration: `mdb-export <mdb> discos -b hex | python scripts/mdb2sqlite.py <csv> <sqlite>`.

## Potential Pitfalls

- **DB path** — the app always opens `$HOME/discos/discos.sqlite` (created automatically on first launch). Override with the `VINYLVAULT_DB_PATH` environment variable.
- **Dev URL port** — `tauri.conf.json` hardcodes `http://localhost:5173`; if Vite picks a different port, update `devUrl` there.
- **Window min-size** — window is fixed at 1200×800 minimum; don't design UI that requires less width.
- **`npm run tauri -- dev`** — note the `--` separator; `npm run tauri dev` (without `--`) won't work.
- **Rust toolchain** — requires `rustup default stable` and platform build tools (see Tauri prerequisites docs).
- **`rusqlite` bundled** — SQLite is statically linked; no system SQLite dependency, but build requires a C compiler.
