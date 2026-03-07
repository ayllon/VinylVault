use crate::sanitize::sanitize_key;
use image::{ImageBuffer, ImageFormat, Rgb};
use jetdb::{read_catalog, read_table_def, read_table_rows, ObjectType, PageReader, Value};
use rusqlite::Connection;
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};

/// Extract a DIB image from an MDB OLE Blob and return as ImageBuffer
fn extract_ole_image(ole_data: &[u8]) -> Result<ImageBuffer<Rgb<u8>, Vec<u8>>, String> {
    // Find the DIB header (starts with 0x28000000 - BITMAPINFOHEADER size)
    let dib_start = ole_data
        .windows(4)
        .position(|w| w == [0x28, 0x00, 0x00, 0x00])
        .ok_or("Could not find DIB header")?;

    // Extract DIB data (everything from BITMAPINFOHEADER onward)
    let dib_data = &ole_data[dib_start..];

    // Parse bit count to determine palette size
    if dib_data.len() < 40 {
        return Err("DIB data too short".to_string());
    }

    let bit_count = u16::from_le_bytes([dib_data[14], dib_data[15]]);
    let num_colors = if bit_count <= 8 {
        let nc = u32::from_le_bytes([dib_data[32], dib_data[33], dib_data[34], dib_data[35]]);
        if nc == 0 {
            1u32 << bit_count
        } else {
            nc
        }
    } else {
        0
    };

    // Calculate pixel offset
    let pixel_offset = 14 + 40 + (num_colors * 4) as usize;

    // Create BMP file header (14 bytes)
    let file_size = (dib_data.len() + 14) as u32;
    let mut bmp_header = Vec::with_capacity(14);
    bmp_header.extend_from_slice(b"BM"); // Signature
    bmp_header.extend_from_slice(&file_size.to_le_bytes()); // File size
    bmp_header.extend_from_slice(&[0, 0, 0, 0]); // Reserved
    bmp_header.extend_from_slice(&(pixel_offset as u32).to_le_bytes()); // Offset

    // Combine header + DIB data
    let mut full_bmp = bmp_header;
    full_bmp.extend_from_slice(dib_data);

    // Load BMP into image crate
    let img = image::load_from_memory_with_format(&full_bmp, image::ImageFormat::Bmp)
        .map_err(|e| format!("Failed to load BMP: {}", e))?;

    Ok(img.to_rgb8())
}

/// Save an extracted image to the covers directory structure
fn save_cover_image(
    image_data: &[u8],
    covers_dir: &Path,
    key: &str,
    suffix: &str,
) -> Result<PathBuf, String> {
    // Extract image from OLE blob
    let img = extract_ole_image(image_data)?;

    // Create nested directory (first 2 chars of key)
    let prefix = if key.len() >= 2 { &key[..2] } else { key };
    let nested_dir = covers_dir.join(prefix);
    fs::create_dir_all(&nested_dir).map_err(|e| format!("Failed to create directory: {}", e))?;

    // Save as JPEG
    let cover_path = nested_dir.join(format!("{}_{}.jpeg", key, suffix));
    let mut output = Cursor::new(Vec::new());
    img.write_to(&mut output, ImageFormat::Jpeg)
        .map_err(|e| format!("Failed to encode JPEG: {}", e))?;

    fs::write(&cover_path, output.into_inner())
        .map_err(|e| format!("Failed to write image file: {}", e))?;

    Ok(cover_path)
}

/// Check if the database is empty (no records in albums table)
pub fn is_db_empty_impl(conn: &Connection) -> Result<bool, String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM albums", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    Ok(count == 0)
}

/// Import MDB file into SQLite database and report row progress.
pub fn import_mdb_impl_with_progress<F>(
    mdb_path: &Path,
    conn: &Connection,
    covers_dir: &Path,
    mut on_progress: F,
) -> Result<usize, String>
where
    F: FnMut(usize, usize),
{
    // Check if DB is empty
    if !is_db_empty_impl(conn)? {
        return Err(
            "Database is not empty. Import can only be done on an empty database.".to_string(),
        );
    }

    // Open MDB file
    let mut reader =
        PageReader::open(mdb_path).map_err(|e| format!("Failed to open MDB: {}", e))?;

    // Read catalog to find the discos table
    let catalog =
        read_catalog(&mut reader).map_err(|e| format!("Failed to read catalog: {}", e))?;

    let discos_entry = catalog
        .iter()
        .find(|entry| entry.name == "discos" && entry.object_type == ObjectType::Table)
        .ok_or("Table 'discos' not found in MDB file")?;

    // Get the discos table definition
    let table_def = read_table_def(&mut reader, "discos", discos_entry.table_page)
        .map_err(|e| format!("Failed to read table definition: {}", e))?;

    // Read all rows from the table
    let result = read_table_rows(&mut reader, &table_def)
        .map_err(|e| format!("Failed to read table rows: {}", e))?;

    result.warn_skipped("discos");

    let mut imported_count = 0;
    let total_rows = result.rows.len();

    on_progress(0, total_rows);

    // Find column indices
    let grupo_idx = table_def.columns.iter().position(|c| c.name == "GRUPO");
    let titulo_idx = table_def.columns.iter().position(|c| c.name == "TITULO");
    let formato_idx = table_def.columns.iter().position(|c| c.name == "FORMATO");
    let anio_idx = table_def.columns.iter().position(|c| c.name == "ANIO");
    let estilo_idx = table_def.columns.iter().position(|c| c.name == "ESTILO");
    let pais_idx = table_def.columns.iter().position(|c| c.name == "PAIS");
    let canciones_idx = table_def.columns.iter().position(|c| c.name == "CANCIONES");
    let creditos_idx = table_def.columns.iter().position(|c| c.name == "CREDITOS");
    let observ_idx = table_def.columns.iter().position(|c| c.name == "OBSERV");
    let cd_idx = table_def
        .columns
        .iter()
        .position(|c| c.name == "Portada CD");
    let lp_idx = table_def
        .columns
        .iter()
        .position(|c| c.name == "Portada LP");

    // Iterate through records
    for row in result.rows {
        // Extract text fields
        let grupo = grupo_idx.and_then(|i| get_string_value(&row[i]));
        let titulo = titulo_idx.and_then(|i| get_string_value(&row[i]));
        let formato = formato_idx.and_then(|i| get_string_value(&row[i]));
        let anio = anio_idx.and_then(|i| get_string_value(&row[i]));
        let estilo = estilo_idx.and_then(|i| get_string_value(&row[i]));
        let pais = pais_idx.and_then(|i| get_string_value(&row[i]));
        let canciones = canciones_idx.and_then(|i| get_string_value(&row[i]));
        let creditos = creditos_idx.and_then(|i| get_string_value(&row[i]));
        let observ = observ_idx.and_then(|i| get_string_value(&row[i]));

        let mut portada_cd_path: Option<String> = None;
        let mut portada_lp_path: Option<String> = None;

        // Extract cover images if present
        if let Some(titulo_val) = &titulo {
            let key = sanitize_key(titulo_val);

            // Extract CD cover
            if let Some(cd_idx) = cd_idx {
                if let Some(cd_data) = get_binary_value(&row[cd_idx]) {
                    if !cd_data.is_empty() {
                        if let Ok(path) = save_cover_image(cd_data, covers_dir, &key, "cd") {
                            portada_cd_path = Some(path.to_string_lossy().to_string());
                        }
                    }
                }
            }

            // Extract LP cover
            if let Some(lp_idx) = lp_idx {
                if let Some(lp_data) = get_binary_value(&row[lp_idx]) {
                    if !lp_data.is_empty() {
                        if let Ok(path) = save_cover_image(lp_data, covers_dir, &key, "lp") {
                            portada_lp_path = Some(path.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }

        // Insert into SQLite
        conn.execute(
            "INSERT INTO albums (
                artist, title, format, year, style, country, tracks, credits, notes, cd_cover_path, lp_cover_path
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                grupo,
                titulo,
                formato,
                anio,
                estilo,
                pais,
                canciones,
                creditos,
                observ,
                portada_cd_path,
                portada_lp_path
            ],
        )
        .map_err(|e| format!("Failed to insert record: {}", e))?;

        imported_count += 1;

        // Emit frequent enough updates without spamming IPC for huge files.
        if imported_count % 25 == 0 || imported_count == total_rows {
            on_progress(imported_count, total_rows);
        }
    }

    Ok(imported_count)
}

// Helper to extract string from Value
fn get_string_value(value: &Value) -> Option<String> {
    match value {
        Value::Text(s) => Some(s.clone()),
        Value::Null => None,
        _ => Some(format!("{:?}", value)), // Convert other types to string
    }
}

// Helper to extract binary data from Value
fn get_binary_value(value: &Value) -> Option<&[u8]> {
    match value {
        Value::Binary(b) => Some(b.as_slice()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_test_db() -> Connection {
        let conn = Connection::open(":memory:").expect("failed to open in-memory db");
        conn.execute(
            "CREATE TABLE albums (
                artist TEXT,
                title TEXT,
                format TEXT,
                year TEXT,
                style TEXT,
                country TEXT,
                tracks TEXT,
                credits TEXT,
                notes TEXT,
                cd_cover_path TEXT,
                lp_cover_path TEXT
            )",
            [],
        )
        .expect("failed to create albums table");
        conn
    }

    #[test]
    fn test_is_db_empty_impl_true_when_table_has_no_rows() {
        let conn = setup_test_db();
        let is_empty = is_db_empty_impl(&conn).expect("empty check failed");
        assert!(is_empty);
    }

    #[test]
    fn test_is_db_empty_impl_false_when_table_has_rows() {
        let conn = setup_test_db();
        conn.execute(
            "INSERT INTO albums (artist, title) VALUES (?1, ?2)",
            rusqlite::params!["Grupo", "Disco"],
        )
        .expect("insert failed");

        let is_empty = is_db_empty_impl(&conn).expect("empty check failed");
        assert!(!is_empty);
    }

    #[test]
    fn test_import_mdb_rejects_non_empty_database_before_opening_mdb() {
        let conn = setup_test_db();
        conn.execute(
            "INSERT INTO albums (artist, title) VALUES (?1, ?2)",
            rusqlite::params!["Grupo", "Disco"],
        )
        .expect("insert failed");

        let covers_dir = std::env::temp_dir().join("vinylvault-test-covers-non-empty");
        let missing_mdb = Path::new("/this/path/does/not/exist/discos.mdb");
        let mut progress_calls = 0usize;

        let result = import_mdb_impl_with_progress(missing_mdb, &conn, &covers_dir, |_, _| {
            progress_calls += 1;
        });

        assert!(result.is_err());
        let err = result.err().expect("expected error");
        assert!(err.contains("Database is not empty"));
        assert_eq!(progress_calls, 0);
    }

    #[test]
    fn test_import_mdb_missing_file_returns_open_error_on_empty_db() {
        let conn = setup_test_db();
        let covers_dir = std::env::temp_dir().join("vinylvault-test-covers-empty");
        let missing_mdb = Path::new("/this/path/does/not/exist/discos.mdb");
        let mut progress_calls = 0usize;

        let result = import_mdb_impl_with_progress(missing_mdb, &conn, &covers_dir, |_, _| {
            progress_calls += 1;
        });

        assert!(result.is_err());
        let err = result.err().expect("expected error");
        assert!(err.contains("Failed to open MDB"));
        assert_eq!(progress_calls, 0);
    }
}
