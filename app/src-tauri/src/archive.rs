use chrono::Local;
use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;
use zip::write::FileOptions;

pub fn create_archive_with_date_suffix(data_dir: &Path) -> Result<PathBuf, String> {
    if !data_dir.exists() {
        return Err(format!(
            "Data directory does not exist: {}",
            data_dir.display()
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

    let date_suffix = Local::now().format("%Y%m%d").to_string();
    let archive_name = format!("{}_{}.zip", dir_name, date_suffix);
    let archive_parent = data_dir.parent().unwrap_or(data_dir);
    let archive_path = archive_parent.join(archive_name);

    create_zip_from_directory(data_dir, &archive_path)?;
    Ok(archive_path)
}

fn create_zip_from_directory(source_dir: &Path, archive_path: &Path) -> Result<(), String> {
    let archive_file = File::create(archive_path).map_err(|e| {
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

    let mut buffer = Vec::new();

    for entry in WalkDir::new(source_dir).follow_links(false) {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path == source_dir {
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
            let mut input_file = File::open(path)
                .map_err(|e| format!("Failed to open file '{}': {}", path.display(), e))?;
            buffer.clear();
            input_file
                .read_to_end(&mut buffer)
                .map_err(|e| format!("Failed to read file '{}': {}", path.display(), e))?;
            zip.write_all(&buffer)
                .map_err(|e| format!("Failed to write file '{}' to zip: {}", rel_name, e))?;
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
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_temp_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time went backwards")
            .as_nanos();
        let path = std::env::temp_dir().join(format!("vinylvault-archive-{label}-{nanos}"));
        fs::create_dir_all(&path).expect("failed to create temp directory");
        path
    }

    #[test]
    fn create_archive_includes_db_and_cover_files() {
        let root = make_temp_dir("content");
        let data_dir = root.join("discos");
        let cover_subdir = data_dir.join("covers").join("ab");
        fs::create_dir_all(&cover_subdir).expect("failed to create cover subdir");

        let db_path = data_dir.join("discos.sqlite");
        let cover_path = cover_subdir.join("album_cd_hash.jpg");
        fs::write(&db_path, b"sqlite-data").expect("failed to write db file");
        fs::write(&cover_path, b"cover-data").expect("failed to write cover file");

        let archive_path =
            create_archive_with_date_suffix(&data_dir).expect("failed to create archive");
        assert!(archive_path.exists());

        let archive_file = File::open(&archive_path).expect("failed to open archive");
        let mut archive =
            zip::ZipArchive::new(archive_file).expect("failed to parse generated zip file");

        assert!(archive.by_name("discos.sqlite").is_ok());
        assert!(archive.by_name("covers/ab/album_cd_hash.jpg").is_ok());
    }
}
