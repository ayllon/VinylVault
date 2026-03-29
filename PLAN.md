# VinylVault: Beta-to-Release Hardening Plan

The Rust backend is production-ready (40+ tests, solid security, good modular
structure, coverage via `cargo llvm-cov` wired into SonarCloud). The frontend
needs the most attention: zero test coverage, a 1,020-line monolithic component,
and a few small bugs. This plan focuses on **pragmatic hardening** — fixing real
risks, adding safety nets, and cleaning up loose ends — without over-engineering
a single-user app.

---

## Phase 1 — Quick Wins

Status: Done

All independent, can be done in any order.

### 1. Fix hardcoded Spanish string

`app/src/App.tsx` line ~353: `alert("No se encontro el registro.")` bypasses
i18n. Add an `errors.record_not_found` key to both `es.json` and `en.json`, and
use `t('errors.record_not_found')`.

### 2. Remove unused `@tauri-apps/plugin-sql`

Listed in `app/package.json` but never imported anywhere in the frontend code.
Dead dependency — `npm uninstall @tauri-apps/plugin-sql`.

### 3. Clean up `index.css`

`app/src/index.css` is leftover Vite template boilerplate. Strip to essential
base resets (`:root`, `body`) or merge the useful bits into `App.css`.

### 4. Add HTTP timeouts to reqwest

`build_http_client()` in `app/src-tauri/src/cover_lookup.rs` and reqwest usage
in `app/src-tauri/src/update_checker.rs` have no timeout configured. Add
`.timeout(Duration::from_secs(15))` to prevent indefinite hangs on bad network.

### 5. Tighten filesystem ACL

`app/src-tauri/capabilities/default.json` grants `fs:allow-read` with
`"path": "**"` (entire filesystem). Scope to `$HOME/discos/**` and
`$DOCUMENT/**` (the latter for MDB import via file dialog). The dialog plugin
handles user-chosen paths; the broad read scope isn't needed.

---

## Phase 2 — Safety Nets

Status: Done

Can be done in parallel with Phase 1.

### 6. Add React Error Boundary

Any render error currently crashes the app to a white screen. Add a minimal
`ErrorBoundary` wrapping `<App />` in `main.tsx`. Display a "Something went
wrong" message with a reload button.

### 7. Add frontend test infrastructure

Install Vitest + `@testing-library/react` + `jsdom`. Add a `"test"` script to
`package.json`. Focus on:

- Utility functions: `getImageSrc()`, `buildGoogleCoverSearchUrl()` (pure
  functions, easy to test).
- Cover lookup logic in `coverLookup.ts`.
- Basic smoke render test for `App` (does it mount without crashing?).
- Wire Vitest into CI (`test.yml` → `lint-frontend` job or new job).
- Generate LCOV output and feed to SonarCloud alongside Rust coverage.

---

## Phase 3 — Code Organization

Depends on Phase 2 (test safety net before refactoring).

### 8. Extract sub-components from App.tsx

The 1,020-line monolith is manageable but increasingly fragile. Extract 2–3
clearly self-contained components:

- **`NavigationBar`** — bottom nav bar with record navigation, add/delete
  buttons, search controls.
- **`RecordForm`** — the form fields grid (artist, title, format, year, etc.).
- **`CoverPanel`** — cover image boxes with context menus and paste/copy/delete.

`App.tsx` remains the orchestrator holding state and passing props. Each new
component gets its own `.tsx` file. No new CSS files — continue using `App.css`.

### 9. Group related state with custom hooks

The 21 `useState` calls could group into:

- `useRecord()` — `currentRecord`, `recordIndex`, `totalRecords`
- `useImport()` — `isImporting`, `importProcessed`, `importTotal`,
  `importPercent`
- `useSearch()` — `searchArtist`, `searchAlbum`, `groups`, `titles`, `formats`

Do this only if component extraction in step 8 makes the boundaries clear.

---

## Phase 4 — Polish

Nice-to-haves, all independent.

### 10. CSS deduplication

`app/src/App.css` has some repeated button hover colors and shared patterns. A
pass to extract CSS custom properties for the color palette (partially done with
`:root` vars already) would reduce duplication. Cosmetic only.

### 12. Prettier

No formatter configured. Consider adding `.prettierrc` and a `format` npm
script for consistent style. Low priority — ESLint already enforces most rules.

### 13. Fix flaky remote test

`test_search_cover_candidates_hits_remote_services` in `cover_lookup.rs` hits
live MusicBrainz/CoverArtArchive APIs and currently fails with a 401 from
`archive.org`. This test is `#[ignore]`-gated (only runs explicitly), but it
should either be made resilient to transient upstream errors (soft-fail / retry)
or replaced with a mock-based test.

---

## Scope Exclusions

- **No UX/UI redesign** — the layout mirrors the legacy Access app.
- **No database schema changes** — schema works and is tested.
- **No new features** — hardening only.
- **No Rust module reorganization** — already well-structured.
- **No state management library** (Redux, Zustand) — custom hooks suffice.
- **No E2E tests** (Playwright, Cypress) — disproportionate effort for a
  single-user desktop app.
- **No dark mode, component library, or CSS framework changes.**

---

## Verification Checklist

- [ ] `npm run lint` and `npm run build` pass
- [ ] `cargo clippy --all-targets --all-features -D warnings` passes
- [ ] `cargo llvm-cov --workspace --all-features` passes
- [ ] `npx vitest run` passes (new frontend tests)
- [ ] Manual smoke test: `npm run tauri -- dev` → CRUD, covers, search, import
- [ ] CI: push to branch, `test.yml` green with all jobs
