use std::cmp::Ordering;

use unicode_normalization::char::is_combining_mark;
use unicode_normalization::UnicodeNormalization;

fn spanish_primary_weight(base: char) -> Option<u16> {
    match base {
        'a' => Some(1),
        'b' => Some(2),
        'c' => Some(3),
        'd' => Some(4),
        'e' => Some(5),
        'f' => Some(6),
        'g' => Some(7),
        'h' => Some(8),
        'i' => Some(9),
        'j' => Some(10),
        'k' => Some(11),
        'l' => Some(12),
        'm' => Some(13),
        'n' => Some(14),
        'o' => Some(16),
        'p' => Some(17),
        'q' => Some(18),
        'r' => Some(19),
        's' => Some(20),
        't' => Some(21),
        'u' => Some(22),
        'v' => Some(23),
        'w' => Some(24),
        'x' => Some(25),
        'y' => Some(26),
        'z' => Some(27),
        _ => None,
    }
}

fn spanish_char_weight(ch: char) -> (u16, u32) {
    if ch == 'ñ' || ch == 'Ñ' {
        return (15, 'ñ' as u32);
    }

    let lower = ch.to_lowercase().next().unwrap_or(ch);
    if let Some(primary) = spanish_primary_weight(lower) {
        return (primary, lower as u32);
    }

    (1000, lower as u32)
}

fn spanish_sort_units(input: &str) -> Vec<char> {
    let normalized: Vec<char> = input.nfd().collect();
    let mut units = Vec::with_capacity(normalized.len());
    let mut i = 0;

    while i < normalized.len() {
        let ch = normalized[i];
        if is_combining_mark(ch) {
            i += 1;
            continue;
        }

        let mut j = i + 1;
        let mut has_tilde = false;
        while j < normalized.len() && is_combining_mark(normalized[j]) {
            if normalized[j] == '\u{0303}' {
                has_tilde = true;
            }
            j += 1;
        }

        if (ch == 'n' || ch == 'N') && has_tilde {
            units.push('ñ');
        } else {
            units.push(ch);
        }

        i = j;
    }

    units
}

pub fn compare_spanish(lhs: &str, rhs: &str) -> Ordering {
    let left = spanish_sort_units(lhs);
    let right = spanish_sort_units(rhs);
    let mut li = 0;
    let mut ri = 0;

    loop {
        match (left.get(li), right.get(ri)) {
            (Some(a), Some(b)) => {
                let wa = spanish_char_weight(*a);
                let wb = spanish_char_weight(*b);
                if wa != wb {
                    return wa.cmp(&wb);
                }
                li += 1;
                ri += 1;
            }
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (None, None) => return Ordering::Equal,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::compare_spanish;
    use std::cmp::Ordering;

    #[test]
    fn spanish_order_handles_enye() {
        assert_eq!(compare_spanish("nube", "ñu"), Ordering::Less);
        assert_eq!(compare_spanish("ñu", "oscar"), Ordering::Less);
    }

    #[test]
    fn spanish_order_ignores_accent_for_sorting() {
        assert_eq!(compare_spanish("a", "á"), Ordering::Equal);
        assert_eq!(compare_spanish("á", "a"), Ordering::Equal);
        assert_eq!(compare_spanish("abeja", "águila"), Ordering::Less);
        assert_eq!(compare_spanish("águila", "azul"), Ordering::Less);
    }

    #[test]
    fn spanish_order_is_normalization_invariant() {
        assert_eq!(compare_spanish("a\u{301}", "á"), Ordering::Equal);
        assert_eq!(compare_spanish("sen\u{0303}or", "señor"), Ordering::Equal);
    }
}
