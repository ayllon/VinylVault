use unicode_normalization::UnicodeNormalization;
use unidecode::unidecode;

/// Sanitize a string to be used as a filesystem-safe key.
/// Converts to lowercase, removes diacritics, transliterates to ASCII, and replaces non-alphanumeric with underscores.
pub fn sanitize_key(text: &str) -> String {
    // Normalize unicode (NFD decomposition)
    let normalized: String = text.nfkd().collect();

    // Remove diacritical marks
    let without_diacritics: String = normalized
        .chars()
        .filter(|c| !unicode_normalization::char::is_combining_mark(*c))
        .collect();

    // Transliterate to ASCII (handles Cyrillic, Greek, etc.)
    let ascii = unidecode(&without_diacritics);

    // Convert to lowercase and replace non-alphanumeric with underscore
    let sanitized: String = ascii
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '_' })
        .collect();

    // Collapse multiple underscores to single underscore
    sanitized
        .split('_')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("_")
}

#[cfg(test)]
mod tests {
    use super::sanitize_key;

    #[test]
    fn test_sanitize_key() {
        assert_eq!(sanitize_key("Hello World"), "hello_world");
        assert_eq!(sanitize_key("Café"), "cafe");
        assert_eq!(sanitize_key("Ñoño"), "nono");
        assert_eq!(sanitize_key("Test@#$%Test"), "test_test");
        assert_eq!(sanitize_key("___test___"), "test");
    }

    #[test]
    fn test_sanitize_key_unicode() {
        assert_eq!(sanitize_key("Zürich"), "zurich");
        assert_eq!(sanitize_key("São Paulo"), "sao_paulo");
        // Cyrillic should be transliterated to Latin
        assert_eq!(sanitize_key("Москва"), "moskva");
    }
}
