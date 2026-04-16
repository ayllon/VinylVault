use chrono::Local;
use rusqlite::Connection;
use std::fs::{self, File, OpenOptions};
use std::io::{copy, BufReader};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use walkdir::WalkDir;
use zip::write::FileOptions;

pub fn create_archive_with_date_suffix(data_dir: &Path, db_path: &Path) -> Result<PathBuf, String> {
    if !data_dir.exists() {
        return Err(format!(
            "Data directory does not exist: {}",
            data_dir.display()
        ));
    }

    if !db_path.exists() {
        return Err(format!(
            "Database file does not exist: {}",
            db_path.display()
        ));
    }

    if !data_dir.is_dir() {
        return Err(format!(
            "Data path is not a directory: {}",
            data_dir.display()
        ));
    }

    let dir_name = data_dir
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or("discos");

    let source_dir = fs::canonicalize(data_dir).map_err(|e| {
        format!(
            "Failed to canonicalize data directory '{}': {}",
            data_dir.display(),
            e
        )
    })?;
    let archive_path = build_unique_archive_path(&source_dir, dir_name)?;

    let db_snapshot = make_db_snapshot_with_vacuum_into(db_path)?;
    create_zip_from_directory(&source_dir, &archive_path, db_path, db_snapshot.path())?;

    Ok(archive_path)
}

fn build_unique_archive_path(source_dir: &Path, dir_name: &str) -> Result<PathBuf, String> {
    let archive_parent = source_dir.parent().ok_or_else(|| {
        format!(
            "Cannot determine a safe archive destination outside source directory '{}'",
            source_dir.display()
        )
    })?;

    let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
    for counter in 0..=9999u32 {
        let suffix = if counter == 0 {
            timestamp.clone()
        } else {
            format!("{}_{:02}", timestamp, counter)
        };
        let candidate = archive_parent.join(format!("{}_{}.zip", dir_name, suffix));
        if !candidate.exists() {
            return Ok(candidate);
        }
    }

    Err(format!(
        "Could not allocate a unique archive filename in '{}'",
        archive_parent.display()
    ))
}

struct TempDbSnapshot {
    path: PathBuf,
}

impl TempDbSnapshot {
    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TempDbSnapshot {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

fn make_db_snapshot_with_vacuum_into(db_path: &Path) -> Result<TempDbSnapshot, String> {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("System clock error: {}", e))?
        .as_nanos();
    let snapshot_path = std::env::temp_dir().join(format!("vinylvault-snapshot-{nanos}.sqlite"));

    let conn = Connection::open(db_path)
        .map_err(|e| format!("Failed to open database '{}': {}", db_path.display(), e))?;

    conn.execute(
        "VACUUM INTO ?1",
        [snapshot_path.to_string_lossy().to_string()],
    )
    .map_err(|e| format!("Failed to create DB snapshot with VACUUM INTO: {}", e))?;

    Ok(TempDbSnapshot {
        path: snapshot_path,
    })
}

fn create_zip_from_directory(
    source_dir: &Path,
    archive_path: &Path,
    db_path: &Path,
    db_snapshot_path: &Path,
) -> Result<(), String> {
    if archive_path.starts_with(source_dir) {
        return Err(format!(
            "Archive destination '{}' is inside source directory '{}', which is unsafe",
            archive_path.display(),
            source_dir.display()
        ));
    }

    let archive_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(archive_path)
        .map_err(|e| {
            format!(
                "Failed to create archive '{}': {}",
                archive_path.display(),
                e
            )
        })?;
    let mut zip = zip::ZipWriter::new(archive_file);

    let dir_options = FileOptions::default().unix_permissions(0o755);
    let file_options = FileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);

    for entry in WalkDir::new(source_dir).follow_links(false) {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path == source_dir {
            continue;
        }

        if path == archive_path {
            continue;
        }

        let rel_path = path.strip_prefix(source_dir).map_err(|e| {
            format!(
                "Failed to build archive path for '{}': {}",
                path.display(),
                e
            )
        })?;
        let rel_name = rel_path.to_string_lossy().replace('\\', "/");

        if entry.file_type().is_dir() {
            zip.add_directory(format!("{}/", rel_name), dir_options)
                .map_err(|e| format!("Failed to add directory '{}' to zip: {}", rel_name, e))?;
            continue;
        }

        if entry.file_type().is_file() {
            zip.start_file(rel_name.clone(), file_options)
                .map_err(|e| format!("Failed to add file '{}' to zip: {}", rel_name, e))?;

            let source_file_for_zip = if path == db_path {
                db_snapshot_path
            } else {
                path
            };
            let mut input_file = File::open(source_file_for_zip).map_err(|e| {
                format!(
                    "Failed to open file '{}': {}",
                    source_file_for_zip.display(),
                    e
                )
            })?;
            let mut input_reader = BufReader::new(&mut input_file);
            copy(&mut input_reader, &mut zip)
                .map_err(|e| format!("Failed to stream file '{}' to zip: {}", rel_name, e))?;
        }
    }

    zip.finish().map_err(|e| {
        format!(
            "Failed to finish archive '{}': {}",
            archive_path.display(),
            e
        )
    })?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::fs;
    use std::ops::Deref;

    struct TestTempDir {
        path: PathBuf,
    }

    impl TestTempDir {
        fn new(label: &str) -> Self {
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("time went backwards")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("vinylvault-archive-{label}-{nanos}"));
            fs::create_dir_all(&path).expect("failed to create temp directory");
            Self { path }
        }
    }

    impl Deref for TestTempDir {
        type Target = Path;

        fn deref(&self) -> &Self::Target {
            &self.path
        }
    }

    impl Drop for TestTempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn create_archive_includes_db_and_cover_files() {
        let root = TestTempDir::new("content");
        let data_dir = root.join("discos");
        let cover_subdir = data_dir.join("covers").join("ab");
        fs::create_dir_all(&cover_subdir).expect("failed to create cover subdir");

        let db_path = data_dir.join("discos.sqlite");
        let conn = Connection::open(&db_path).expect("failed to create test db");
        conn.execute("CREATE TABLE t (v TEXT)", [])
            .expect("failed to create table in test db");
        conn.execute("INSERT INTO t (v) VALUES ('ok')", [])
            .expect("failed to insert test row");

        let cover_path = cover_subdir.join("album_cd_hash.jpg");
        fs::write(&cover_path, b"cover-data").expect("failed to write cover file");

        let archive_path =
            create_archive_with_date_suffix(&data_dir, &db_path).expect("failed to create archive");
        assert!(archive_path.exists());

        let archive_file = File::open(&archive_path).expect("failed to open archive");
        let mut archive =
            zip::ZipArchive::new(archive_file).expect("failed to parse generated zip file");

        assert!(archive.by_name("discos.sqlite").is_ok());
        assert!(archive.by_name("covers/ab/album_cd_hash.jpg").is_ok());
    }

    #[test]
    fn create_archive_twice_does_not_overwrite_previous_archive() {
        let root = TestTempDir::new("unique-name");
        let data_dir = root.join("discos");
        fs::create_dir_all(&data_dir).expect("failed to create data directory");

        let db_path = data_dir.join("discos.sqlite");
        let conn = Connection::open(&db_path).expect("failed to create test db");
        conn.execute("CREATE TABLE t (v TEXT)", [])
            .expect("failed to create table in test db");
        conn.execute("INSERT INTO t (v) VALUES ('ok')", [])
            .expect("failed to insert test row");

        let first_path =
            create_archive_with_date_suffix(&data_dir, &db_path).expect("first archive failed");
        let second_path =
            create_archive_with_date_suffix(&data_dir, &db_path).expect("second archive failed");

        assert!(first_path.exists());
        assert!(second_path.exists());
        assert_ne!(first_path, second_path);
    }
}
