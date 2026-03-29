# Internationalization (i18n) Setup

## Overview

VinylVault now supports full internationalization with English and Spanish language support using **i18next** and **react-i18next**.

## Architecture

### Translation Files
- **Spanish** (`app/src/i18n/es.json`) - Main language, set as default
- **English** (`app/src/i18n/en.json`) - Alternative language

### Configuration
- **i18n Config** (`app/src/i18n/config.ts`) - i18next initialization
  - Auto-detects saved language preference from localStorage
  - Falls back to Spanish if not set
  - Language preference persists across app sessions

### Integration Points
- **main.tsx** - Imports i18n config before React renders
- **App.tsx** - Uses `useTranslation()` hook to access translations

## Usage in Code

### Accessing Translations
```typescript
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t, i18n } = useTranslation();
  
  return (
    <div>
      <h1>{t('fields.group')}</h1>
      {/* Interpolation with variables */}
      <p>{t('import_count', { processed: 5, total: 10 })}</p>
      {/* Current language */}
      <p>Current: {i18n.language}</p>
    </div>
  );
}
```

### Changing Language Programmatically
```typescript
i18n.changeLanguage('en');  // Switch to English
i18n.changeLanguage('es');  // Switch to Spanish
```

## Adding New Translations

### 1. Add to Translation Files
Edit both `app/src/i18n/es.json` and `app/src/i18n/en.json`:

**Spanish (es.json):**
```json
{
  "new_key": "Valor en español"
}
```

**English (en.json):**
```json
{
  "new_key": "Value in English"
}
```

### 2. Use in Component
```typescript
const { t } = useTranslation();
<label>{t('new_key')}</label>
```

## Translation Key Structure

Keys are organized hierarchically using dot notation for better organization:

- **Top-level keys** — Simple strings like `app_title`, `loading`, `empty_db`
- **Namespace keys** — Related content grouped under a prefix:
  - `fields.*` — Form field labels (album, artist, year, etc.)
  - `search.*` — Search UI elements
  - `actions.*` — Buttons and user actions
  - `cover_lookup.*` — Online cover lookup dialog
  - `updates.*` — Update notifications
  - `errors.*` — Error messages (e.g., record not found, unexpected title)
  - `import_*` — Import-related messages and errors

For a complete list of available keys, see [es.json](app/src/i18n/es.json) and [en.json](app/src/i18n/en.json).

## Language Selector

A language selector dropdown is built into the navigation bar at the bottom right of the app:
- **Español** (Spanish) - Default
- **English** (English)

Selecting a language immediately updates the entire UI and saves the preference.

## Best Practices

1. **Always add to both files** - Maintain translations for both English and Spanish
2. **Use nested keys** - Group related translations (e.g., `fields.group`, `search.by_album`)
3. **Use interpolation** - Use `{{variable}}` for dynamic values instead of string concatenation
4. **Keep keys lowercase** - Use camelCase or dot notation for hierarchical keys

## Deployment

The i18n setup requires **no special build configuration**:
- Translation files are bundled with the app
- No runtime language file loading needed
- Language preference persists in localStorage

## Future Enhancements

Possible improvements:
- Add more languages (Portuguese, French, etc.)
- Implement pluralization rules for different languages
- Add language detection based on browser/system locale
- Create admin panel for managing translations
- Implement per-language decimal/date formatting
