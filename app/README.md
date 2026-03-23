# VinylVault Frontend (app)

Frontend workspace for VinylVault, built with Vite + React + TypeScript.

The desktop app runtime is provided by Tauri and Rust in `app/src-tauri/`.

## Tech Stack

- React 19 + TypeScript (strict mode)
- Vite for frontend build/dev server
- i18next + react-i18next for localization
- react-select for searchable dropdowns

## Commands

Run from this directory (`app/`):

```bash
npm install
npm run dev
npm run build
npm run lint
npm run preview
npm run tauri -- dev
npm run tauri -- build
```

## Project Structure

- `src/App.tsx`: Main UI (single-page app)
- `src/App.css` and `src/index.css`: App styling
- `src/i18n/config.ts`: i18next initialization
- `src/i18n/es.json`: Spanish translations
- `src/i18n/en.json`: English translations
- `src-tauri/`: Rust backend and Tauri configuration

## Frontend Conventions

- All user-facing text must go through i18n keys (no hardcoded strings).
- Keep CSS in plain `.css` files (no Tailwind/CSS modules).
- Keep additions in `App.tsx` unless extraction is clearly warranted.
- Prefer save-on-blur behavior for editable fields.

See the root [I18N_GUIDE.md](../I18N_GUIDE.md) for translation key organization and usage examples.
