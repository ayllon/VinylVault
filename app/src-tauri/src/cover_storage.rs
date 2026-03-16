use image::{ImageBuffer, ImageFormat, Rgb};
use std::fs;
use std::io::ErrorKind;
use std::io::Cursor;
use std::path::{Component, Path, PathBuf};

fn short_content_hash(bytes: &[u8]) -> String {
    // FNV-1a 32-bit gives a small deterministic hash with no external dependency.
    let mut hash: u32 = 0x811c9dc5;
    for b in bytes {
        hash ^= u32::from(*b);
        hash = hash.wrapping_mul(0x01000193);
    }
    format!("{:08x}", hash)[..6].to_string()
}

#[derive(Debug, Clone)]
pub struct CoverStorage {
    db_dir: PathBuf,
    covers_dir: PathBuf,
}

impl CoverStorage {
    /// Create a storage helper bound to a specific SQLite DB path.
    pub fn new(db_path: &Path) -> Result<Self, String> {
        let db_dir = db_path
            .parent()
            .ok_or("Invalid database path: no parent directory")?
            .to_path_buf();
        let covers_dir = db_dir.join("covers");
        Ok(Self { db_dir, covers_dir })
    }

    pub fn covers_dir(&self) -> &Path {
        &self.covers_dir
    }

    /// Save a decoded cover image and return a DB-storable path relative to the DB directory.
    pub fn save_cover_image(
        &self,
        img: &ImageBuffer<Rgb<u8>, Vec<u8>>,
        key: &str,
        suffix: &str,
    ) -> Result<PathBuf, String> {
        let prefix = if key.len() >= 2 { &key[..2] } else { key };
        let nested_dir = self.covers_dir.join(prefix);
        fs::create_dir_all(&nested_dir)
            .map_err(|e| format!("Failed to create directory: {}", e))?;

        let mut output = Cursor::new(Vec::new());
        img.write_to(&mut output, ImageFormat::Jpeg)
            .map_err(|e| format!("Failed to encode JPEG: {}", e))?;
        let encoded = output.into_inner();
        let hash = short_content_hash(&encoded);
        let cover_path = nested_dir.join(format!("{}_{}_{}.jpg", key, suffix, hash));

        fs::write(&cover_path, encoded)
            .map_err(|e| format!("Failed to write image file: {}", e))?;

        self.path_relative_to_db(&cover_path)
    }

    /// Convert an absolute cover path on disk to a DB-storable path relative to DB directory.
    fn path_relative_to_db(&self, cover_path: &Path) -> Result<PathBuf, String> {
        cover_path
            .strip_prefix(&self.db_dir)
            .map(|p| p.to_path_buf())
            .map_err(|_| {
                format!(
                    "Cover path '{}' is not under DB directory '{}'",
                    cover_path.display(),
                    self.db_dir.display()
                )
            })
    }

    /// Resolve a DB-stored cover path (relative preferred, absolute tolerated) to a disk path.
    pub fn resolve_cover_path_from_db(&self, stored_path: &str) -> PathBuf {
        let path = Path::new(stored_path);
        if path.is_absolute() {
            return path.to_path_buf();
        }

        self.db_dir.join(path)
    }

    /// Delete a cover image referenced by a DB path. Returns true if a file was deleted.
    pub fn delete_cover(&self, stored_path: &str) -> Result<bool, String> {
        let path = Path::new(stored_path);

        if !path.is_absolute()
            && path
                .components()
                .any(|component| matches!(component, Component::ParentDir))
        {
            return Err(format!(
                "Invalid cover path '{}': parent directory segments are not allowed",
                stored_path
            ));
        }

        let absolute = self.resolve_cover_path_from_db(stored_path);
        if !absolute.starts_with(&self.db_dir) {
            return Err(format!(
                "Refusing to delete cover outside DB directory: '{}'",
                absolute.display()
            ));
        }

        match fs::remove_file(&absolute) {
            Ok(()) => Ok(true),
            Err(e) if e.kind() == ErrorKind::NotFound => Ok(false),
            Err(e) => Err(format!(
                "Failed to delete cover '{}': {}",
                absolute.display(),
                e
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_unique_tmp_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time went backwards")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("vinylvault-{label}-{nanos}"));
        fs::create_dir_all(&dir).expect("failed to create temp directory");
        dir
    }

    #[test]
    fn test_path_relative_to_db() {
        let db_path = Path::new("/tmp/vinyl/discos.sqlite");
        let cover_path = Path::new("/tmp/vinyl/covers/ab/album_cd_abcdef.jpg");
        let storage = CoverStorage::new(db_path).expect("cover storage init failed");

        let rel = storage
            .path_relative_to_db(cover_path)
            .expect("relative conversion failed");
        assert_eq!(rel, Path::new("covers/ab/album_cd_abcdef.jpg"));
    }

    #[test]
    fn test_resolve_cover_path_from_db_handles_relative() {
        let db_path = Path::new("/tmp/vinyl/discos.sqlite");
        let storage = CoverStorage::new(db_path).expect("cover storage init failed");
        let resolved = storage.resolve_cover_path_from_db("covers/ab/album_cd_abcdef.jpg");

        assert_eq!(resolved, Path::new("/tmp/vinyl/covers/ab/album_cd_abcdef.jpg"));
    }

    #[test]
    fn test_resolve_cover_path_from_db_keeps_absolute() {
        let db_path = Path::new("/tmp/vinyl/discos.sqlite");
        let storage = CoverStorage::new(db_path).expect("cover storage init failed");
        let absolute = "/var/data/covers/ab/album_cd_abcdef.jpg";
        let resolved = storage.resolve_cover_path_from_db(absolute);

        assert_eq!(resolved, Path::new(absolute));
    }

    #[test]
    fn test_covers_dir() {
        let db_path = Path::new("/tmp/vinyl/discos.sqlite");
        let storage = CoverStorage::new(db_path).expect("cover storage init failed");

        assert_eq!(storage.covers_dir(), Path::new("/tmp/vinyl/covers"));
    }

    #[test]
    fn test_delete_cover_removes_existing_file() {
        let root = make_unique_tmp_dir("delete-cover-existing");
        let db_path = root.join("discos.sqlite");
        let storage = CoverStorage::new(&db_path).expect("cover storage init failed");

        let rel_path = Path::new("covers/ab/album_cd_abcdef.jpg");
        let abs_path = root.join(rel_path);
        fs::create_dir_all(abs_path.parent().expect("parent missing"))
            .expect("failed to create cover directory");
        fs::write(&abs_path, [1u8, 2u8, 3u8]).expect("failed to write temp file");

        let deleted = storage
            .delete_cover("covers/ab/album_cd_abcdef.jpg")
            .expect("delete failed");
        assert!(deleted);
        assert!(!abs_path.exists());

        fs::remove_dir_all(&root).expect("failed to cleanup temp root");
    }

    #[test]
    fn test_delete_cover_returns_false_for_missing_file() {
        let root = make_unique_tmp_dir("delete-cover-missing");
        let db_path = root.join("discos.sqlite");
        let storage = CoverStorage::new(&db_path).expect("cover storage init failed");

        let deleted = storage
            .delete_cover("covers/ab/missing_cd_abcdef.jpg")
            .expect("delete should not fail for missing file");
        assert!(!deleted);

        fs::remove_dir_all(&root).expect("failed to cleanup temp root");
    }

    #[test]
    fn test_delete_cover_rejects_parent_dir_segments() {
        let db_path = Path::new("/tmp/vinyl/discos.sqlite");
        let storage = CoverStorage::new(db_path).expect("cover storage init failed");

        let err = storage
            .delete_cover("covers/../outside.jpg")
            .expect_err("expected traversal path to fail");

        assert!(err.contains("parent directory segments"));
    }

    #[test]
    fn test_save_cover_image_includes_hash_suffix_and_jpg_extension() {
        let root = make_unique_tmp_dir("save-cover-hash");
        let db_path = root.join("discos.sqlite");
        let storage = CoverStorage::new(&db_path).expect("cover storage init failed");

        let img = ImageBuffer::from_pixel(2, 2, Rgb([12, 34, 56]));
        let rel = storage
            .save_cover_image(&img, "album", "cd")
            .expect("save failed");

        let rel_str = rel.to_string_lossy();
        assert!(rel_str.starts_with("covers/al/album_cd_"));
        assert!(rel_str.ends_with(".jpg"));

        let abs = storage.resolve_cover_path_from_db(&rel_str);
        assert!(abs.exists());

        fs::remove_dir_all(&root).expect("failed to cleanup temp root");
    }
}
