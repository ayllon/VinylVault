use image::{ImageBuffer, ImageFormat, Rgb};
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

/// Save a decoded cover image under `covers/<prefix>/<key>_<suffix>.jpeg`.
pub fn save_cover_image(
    img: &ImageBuffer<Rgb<u8>, Vec<u8>>,
    covers_dir: &Path,
    key: &str,
    suffix: &str,
) -> Result<PathBuf, String> {
    let prefix = if key.len() >= 2 { &key[..2] } else { key };
    let nested_dir = covers_dir.join(prefix);
    fs::create_dir_all(&nested_dir).map_err(|e| format!("Failed to create directory: {}", e))?;

    let cover_path = nested_dir.join(format!("{}_{}.jpeg", key, suffix));
    let mut output = Cursor::new(Vec::new());
    img.write_to(&mut output, ImageFormat::Jpeg)
        .map_err(|e| format!("Failed to encode JPEG: {}", e))?;

    fs::write(&cover_path, output.into_inner())
        .map_err(|e| format!("Failed to write image file: {}", e))?;

    Ok(cover_path)
}

/// Convert an absolute cover path on disk to a DB-storable path relative to the DB directory.
pub fn path_relative_to_db(db_path: &Path, cover_path: &Path) -> Result<PathBuf, String> {
    let db_dir = db_path
        .parent()
        .ok_or("Invalid database path: no parent directory")?;

    cover_path
        .strip_prefix(db_dir)
        .map(|p| p.to_path_buf())
        .map_err(|_| {
            format!(
                "Cover path '{}' is not under DB directory '{}'",
                cover_path.display(),
                db_dir.display()
            )
        })
}

/// Resolve a DB-stored cover path (relative preferred, absolute tolerated) to a disk path.
pub fn resolve_cover_path_from_db(db_path: &Path, stored_path: &str) -> PathBuf {
    let path = Path::new(stored_path);
    if path.is_absolute() {
        return path.to_path_buf();
    }

    match db_path.parent() {
        Some(db_dir) => db_dir.join(path),
        None => path.to_path_buf(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_path_relative_to_db() {
        let db_path = Path::new("/tmp/vinyl/discos.sqlite");
        let cover_path = Path::new("/tmp/vinyl/covers/ab/album_cd.jpeg");

        let rel = path_relative_to_db(db_path, cover_path).expect("relative conversion failed");
        assert_eq!(rel, Path::new("covers/ab/album_cd.jpeg"));
    }

    #[test]
    fn test_resolve_cover_path_from_db_handles_relative() {
        let db_path = Path::new("/tmp/vinyl/discos.sqlite");
        let resolved = resolve_cover_path_from_db(db_path, "covers/ab/album_cd.jpeg");

        assert_eq!(resolved, Path::new("/tmp/vinyl/covers/ab/album_cd.jpeg"));
    }

    #[test]
    fn test_resolve_cover_path_from_db_keeps_absolute() {
        let db_path = Path::new("/tmp/vinyl/discos.sqlite");
        let absolute = "/var/data/covers/ab/album_cd.jpeg";
        let resolved = resolve_cover_path_from_db(db_path, absolute);

        assert_eq!(resolved, Path::new(absolute));
    }
}
