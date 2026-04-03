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

    let mut base: Option<char> = None;
    for part in ch.to_string().nfd() {
        if !is_combining_mark(part) && base.is_none() {
            base = Some(part);
        }
    }

    let base = base.unwrap_or(ch);
    let lower = base.to_lowercase().next().unwrap_or(base);
    if let Some(primary) = spanish_primary_weight(lower) {
        return (primary, lower as u32);
    }

    (1000, lower as u32)
}

pub fn compare_spanish(lhs: &str, rhs: &str) -> Ordering {
    let mut left = lhs.chars();
    let mut right = rhs.chars();

    loop {
        match (left.next(), right.next()) {
            (Some(a), Some(b)) => {
                let wa = spanish_char_weight(a);
                let wb = spanish_char_weight(b);
                if wa != wb {
                    return wa.cmp(&wb);
                }
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
}
