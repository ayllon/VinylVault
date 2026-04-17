mod archive;
mod collation;
mod cover_lookup;
mod cover_storage;
mod db;
mod mdb_import;
mod sanitize;
mod update_checker;
mod window_sizing;

use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::{env, fs};
use tauri::{Emitter, State};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::cover_lookup::{CoverCandidate, CoverSearchQuery};
use crate::cover_storage::CoverStorage;
use crate::update_checker::UpdateInfo;
use crate::window_sizing::apply_adaptive_window_size;

const DEBUG_IMPORT_TEMP_DIR: &str = "vinylvault-mdb-import-debug";

#[derive(Clone)]
struct AppState {
    db_pool: Pool<SqliteConnectionManager>,
    cover_storage: CoverStorage,
}

#[derive(Serialize, Clone)]
struct ImportProgressPayload {
    processed: usize,
    total: usize,
    percent: f64,
}

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct Record {
    pub id: i64,
    pub artist: Option<String>,
    pub title: Option<String>,
    pub format: Option<String>,
    pub year: Option<String>,
    pub style: Option<String>,
    pub country: Option<String>,
    pub tracks: Option<String>,
    pub credits: Option<String>,
    pub edition: Option<String>,
    pub notes: Option<String>,
    pub cd_cover_path: Option<String>,
    pub lp_cover_path: Option<String>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct GroupsAndTitles {
    pub groups: Vec<String>,
    pub titles: Vec<String>,
    pub formatos: Vec<String>,
}

// Implementation functions (testable, take &Connection)

fn get_total_records_impl(conn: &Connection) -> Result<u32, String> {
    let count: u32 = conn
        .query_row("SELECT COUNT(*) FROM albums", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    Ok(count)
}

fn get_record_impl(conn: &Connection, offset: u32) -> Result<Record, String> {
    let mut stmt = conn
        .prepare(
            "SELECT rowid, artist, title, format, year, style, country, tracks, credits, edition, notes, cd_cover_path, lp_cover_path 
            FROM albums
            ORDER BY artist COLLATE SPANISH, year, rowid
            LIMIT 1 OFFSET ?",
        )
        .map_err(|e| e.to_string())?;

    let mut rows = stmt.query([offset]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let record = Record {
            id: row.get(0).unwrap_or(0),
            artist: row.get(1).unwrap_or(None),
            title: row.get(2).unwrap_or(None),
            format: row.get(3).unwrap_or(None),
            year: row.get(4).unwrap_or(None),
            style: row.get(5).unwrap_or(None),
            country: row.get(6).unwrap_or(None),
            tracks: row.get(7).unwrap_or(None),
            credits: row.get(8).unwrap_or(None),
            edition: row.get(9).unwrap_or(None),
            notes: row.get(10).unwrap_or(None),
            cd_cover_path: row.get(11).unwrap_or(None),
            lp_cover_path: row.get(12).unwrap_or(None),
        };
        Ok(record)
    } else {
        Err("Record not found".to_string())
    }
}

fn get_groups_and_titles_impl(conn: &Connection) -> Result<GroupsAndTitles, String> {
    let mut groups = Vec::new();
    let mut stmt = conn.prepare("SELECT DISTINCT artist FROM albums WHERE artist IS NOT NULL AND artist != '' ORDER BY artist COLLATE SPANISH, artist").map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        if let Ok(g) = row.get::<_, String>(0) {
            groups.push(g);
        }
    }

    let mut titles = Vec::new();
    let mut stmt2 = conn.prepare("SELECT DISTINCT title FROM albums WHERE title IS NOT NULL AND title != '' ORDER BY title COLLATE SPANISH, title").map_err(|e| e.to_string())?;
    let mut rows2 = stmt2.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows2.next().map_err(|e| e.to_string())? {
        if let Ok(t) = row.get::<_, String>(0) {
            titles.push(t);
        }
    }

    let mut formatos = Vec::new();
    let mut stmt3 = conn.prepare("SELECT DISTINCT format FROM albums WHERE format IS NOT NULL AND format != '' ORDER BY format COLLATE SPANISH, format").map_err(|e| e.to_string())?;
    let mut rows3 = stmt3.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows3.next().map_err(|e| e.to_string())? {
        if let Ok(f) = row.get::<_, String>(0) {
            formatos.push(f);
        }
    }

    Ok(GroupsAndTitles {
        groups,
        titles,
        formatos,
    })
}

fn find_record_offset_impl(
    conn: &Connection,
    column: String,
    value: String,
) -> Result<u32, String> {
    // Safety: column must be artist or title
    let col = match column.as_str() {
        "artist" => "artist",
        "title" => "title",
        _ => return Err(format!("Invalid column: {}", column)),
    };

    let query = format!(
        "WITH ordered AS (
            SELECT
                rowid,
                artist,
                title,
                ROW_NUMBER() OVER (
                    ORDER BY
                        (artist IS NULL OR artist = ''),
                        artist COLLATE SPANISH,
                        (year IS NULL),
                        year,
                        rowid
                ) - 1 AS offset
            FROM albums
        )
        SELECT offset
        FROM ordered
        WHERE {} = ?1
        ORDER BY offset
        LIMIT 1",
        col
    );

    let mut stmt = conn.prepare(&query).map_err(|e| e.to_string())?;
    let offset: u32 = stmt
        .query_row([value], |row| row.get(0))
        .map_err(|e| e.to_string())?;

    Ok(offset)
}

fn add_record_impl(conn: &Connection) -> Result<u32, String> {
    conn.execute(
        "INSERT INTO albums (artist, title) VALUES ('Nuevo Grupo', 'Nuevo Disco')",
        [],
    )
    .map_err(|e| e.to_string())?;

    let inserted_rowid = conn.last_insert_rowid();
    let offset: u32 = conn
        .query_row(
            "WITH ordered AS (
                SELECT rowid,
                       ROW_NUMBER() OVER (
                           ORDER BY artist COLLATE SPANISH, year, rowid
                       ) - 1 AS offset
                FROM albums
            )
            SELECT offset FROM ordered WHERE rowid = ?1",
            [inserted_rowid],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    Ok(offset)
}

fn update_record_impl(conn: &Connection, record: Record) -> Result<(), String> {
    conn.execute(
        "UPDATE albums SET artist=?1, title=?2, format=?3, year=?4, style=?5, country=?6, tracks=?7, credits=?8, edition=?9, notes=?10 WHERE rowid=?11",
        rusqlite::params![record.artist, record.title, record.format, record.year, record.style, record.country, record.tracks, record.credits, record.edition, record.notes, record.id]
    ).map_err(|e| e.to_string())?;
    Ok(())
}

fn delete_record_impl(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM albums WHERE rowid=?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn save_cover_from_rgba_impl(
    conn: &Connection,
    cover_storage: &CoverStorage,
    record_id: i64,
    image_bytes: Vec<u8>,
    image_width: u32,
    image_height: u32,
    suffix: &str,
) -> Result<String, String> {
    use crate::sanitize::sanitize_key;
    use image::{DynamicImage, ImageBuffer, Rgba};

    let col_name = match suffix {
        "cd" => "cd_cover_path",
        "lp" => "lp_cover_path",
        _ => return Err(format!("Invalid suffix: {}", suffix)),
    };

    // Fetch the record to get the title
    let title: Option<String> = conn
        .query_row(
            "SELECT title FROM albums WHERE rowid=?1",
            [record_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to fetch record: {}", e))?;

    let title = title.ok_or("Record has no title; cannot save cover")?;
    let key = sanitize_key(&title);

    let existing_cover_query = format!("SELECT {} FROM albums WHERE rowid=?1", col_name);
    let existing_cover: Option<String> = conn
        .query_row(&existing_cover_query, [record_id], |row| row.get(0))
        .map_err(|e| format!("Failed to fetch existing cover path: {}", e))?;

    if let Some(existing_cover) = existing_cover {
        if !existing_cover.trim().is_empty() {
            cover_storage.delete_cover(&existing_cover)?;
        }
    }

    let rgba = ImageBuffer::<Rgba<u8>, Vec<u8>>::from_raw(image_width, image_height, image_bytes)
        .ok_or_else(|| {
        format!(
            "Invalid RGBA buffer size for dimensions {}x{}",
            image_width, image_height
        )
    })?;
    let rgb_img = DynamicImage::ImageRgba8(rgba).to_rgb8();

    // Save cover and get the DB-storable relative path.
    let rel_path = cover_storage.save_cover_image(&rgb_img, &key, suffix)?;

    let query = format!("UPDATE albums SET {} = ?1 WHERE rowid = ?2", col_name);
    conn.execute(&query, rusqlite::params![rel_path.clone(), record_id])
        .map_err(|e| format!("Failed to update record: {}", e))?;

    let cover_path = cover_storage.resolve_cover_path_from_db(&rel_path);
    Ok(cover_path.to_string_lossy().to_string())
}

fn delete_cover_for_record_impl(
    conn: &Connection,
    cover_storage: &CoverStorage,
    record_id: i64,
    suffix: &str,
) -> Result<(), String> {
    let col_name = match suffix {
        "cd" => "cd_cover_path",
        "lp" => "lp_cover_path",
        _ => return Err(format!("Invalid suffix: {}", suffix)),
    };

    let existing_cover_query = format!("SELECT {} FROM albums WHERE rowid=?1", col_name);
    let existing_cover: Option<String> = conn
        .query_row(&existing_cover_query, [record_id], |row| row.get(0))
        .map_err(|e| format!("Failed to fetch existing cover path: {}", e))?;

    if let Some(existing_cover) = existing_cover {
        if !existing_cover.trim().is_empty() {
            cover_storage.delete_cover(&existing_cover)?;
        }
    }

    let query = format!("UPDATE albums SET {} = NULL WHERE rowid = ?1", col_name);
    conn.execute(&query, [record_id])
        .map_err(|e| format!("Failed to update record: {}", e))?;

    Ok(())
}

// Tauri command handlers (thin wrappers around _impl)

#[tauri::command]
fn get_total_records(state: State<AppState>) -> Result<u32, String> {
    let conn = state.db_pool.get().map_err(|e| e.to_string())?;
    get_total_records_impl(&conn)
}

#[tauri::command]
fn get_record(offset: u32, state: State<AppState>) -> Result<Record, String> {
    let conn = state.db_pool.get().map_err(|e| e.to_string())?;
    let mut record = get_record_impl(&conn, offset)?;

    record.cd_cover_path = record.cd_cover_path.as_deref().map(|p| {
        state
            .cover_storage
            .resolve_cover_path_from_db(p)
            .to_string_lossy()
            .to_string()
    });
    record.lp_cover_path = record.lp_cover_path.as_deref().map(|p| {
        state
            .cover_storage
            .resolve_cover_path_from_db(p)
            .to_string_lossy()
            .to_string()
    });

    Ok(record)
}

#[tauri::command]
fn get_groups_and_titles(state: State<AppState>) -> Result<GroupsAndTitles, String> {
    let conn = state.db_pool.get().map_err(|e| e.to_string())?;
    get_groups_and_titles_impl(&conn)
}

#[tauri::command]
fn find_record_offset(
    column: String,
    value: String,
    state: State<AppState>,
) -> Result<u32, String> {
    let conn = state.db_pool.get().map_err(|e| e.to_string())?;
    find_record_offset_impl(&conn, column, value)
}

#[tauri::command]
fn add_record(state: State<AppState>) -> Result<u32, String> {
    let conn = state.db_pool.get().map_err(|e| e.to_string())?;
    add_record_impl(&conn)
}

#[tauri::command]
fn update_record(record: Record, state: State<AppState>) -> Result<(), String> {
    let conn = state.db_pool.get().map_err(|e| e.to_string())?;
    update_record_impl(&conn, record)
}

#[tauri::command]
fn delete_record(id: i64, state: State<AppState>) -> Result<(), String> {
    let conn = state.db_pool.get().map_err(|e| e.to_string())?;
    delete_record_impl(&conn, id)
}

#[tauri::command]
fn save_cover_paste(
    record_id: i64,
    image_bytes: Vec<u8>,
    image_width: u32,
    image_height: u32,
    suffix: String,
    state: State<AppState>,
) -> Result<String, String> {
    let conn = state.db_pool.get().map_err(|e| e.to_string())?;
    save_cover_from_rgba_impl(
        &conn,
        &state.cover_storage,
        record_id,
        image_bytes,
        image_width,
        image_height,
        &suffix,
    )
}

#[tauri::command]
async fn save_cover_paste_from_clipboard(
    record_id: i64,
    suffix: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let pool = state.db_pool.clone();
    let cover_storage = state.cover_storage.clone();
    let app_handle = app.clone();

    tauri::async_runtime::spawn_blocking(move || {
        // Clipboard read is intentionally done off the main thread to avoid Linux deadlocks.
        let clipboard_image = app_handle
            .clipboard()
            .read_image()
            .map_err(|e| format!("Failed to read image from clipboard: {}", e))?
            .to_owned();

        let conn = pool.get().map_err(|e| e.to_string())?;
        save_cover_from_rgba_impl(
            &conn,
            &cover_storage,
            record_id,
            clipboard_image.rgba().to_vec(),
            clipboard_image.width(),
            clipboard_image.height(),
            &suffix,
        )
    })
    .await
    .map_err(|e| format!("Paste task failed: {}", e))?
}

#[tauri::command]
async fn search_cover_candidates(query: CoverSearchQuery) -> Result<Vec<CoverCandidate>, String> {
    cover_lookup::search_cover_candidates(&query).await
}

#[tauri::command]
async fn import_cover_from_url(
    record_id: i64,
    suffix: String,
    image_url: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let image_bytes = cover_lookup::fetch_cover_image_bytes(&image_url).await?;
    let dyn_img = image::load_from_memory(&image_bytes)
        .map_err(|e| format!("Failed to decode downloaded cover image: {}", e))?;
    let rgba = dyn_img.to_rgba8();
    let (width, height) = rgba.dimensions();

    let conn = state.db_pool.get().map_err(|e| e.to_string())?;
    save_cover_from_rgba_impl(
        &conn,
        &state.cover_storage,
        record_id,
        rgba.into_raw(),
        width,
        height,
        &suffix,
    )
}

#[tauri::command]
async fn copy_cover_to_clipboard(app: tauri::AppHandle, cover_path: String) -> Result<(), String> {
    use tauri::image::Image;

    let app_handle = app.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let path = Path::new(&cover_path);
        let dyn_img = image::open(path)
            .map_err(|e| format!("Failed to open image '{}': {}", cover_path, e))?;
        let rgba = dyn_img.to_rgba8();
        let (width, height) = rgba.dimensions();

        let img = Image::new_owned(rgba.into_raw(), width, height);
        app_handle
            .clipboard()
            .write_image(&img)
            .map_err(|e| format!("Failed to write image to clipboard: {}", e))
    })
    .await
    .map_err(|e| format!("Copy task failed: {}", e))?
}

#[tauri::command]
fn delete_cover_for_record(
    record_id: i64,
    suffix: String,
    state: State<AppState>,
) -> Result<(), String> {
    let conn = state.db_pool.get().map_err(|e| e.to_string())?;
    delete_cover_for_record_impl(&conn, &state.cover_storage, record_id, &suffix)
}

#[tauri::command]
fn get_covers_dir(state: State<AppState>) -> Result<String, String> {
    Ok(state
        .cover_storage
        .covers_dir()
        .to_string_lossy()
        .to_string())
}

#[tauri::command]
fn is_db_empty(state: State<AppState>) -> Result<bool, String> {
    let conn = state.db_pool.get().map_err(|e| e.to_string())?;
    mdb_import::is_db_empty_impl(&conn)
}

#[tauri::command]
async fn check_for_updates(app: tauri::AppHandle) -> Result<Option<UpdateInfo>, String> {
    let current_version = app.package_info().version.clone();

    update_checker::fetch_update_info(&current_version).await
}

#[tauri::command]
async fn import_mdb(
    mdb_path: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<usize, String> {
    let pool = state.db_pool.clone();
    let cover_storage = state.cover_storage.clone();
    let app_handle = app.clone();
    let mdb_path_buf = PathBuf::from(mdb_path);

    tauri::async_runtime::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| e.to_string())?;

        let imported_count = mdb_import::import_mdb_impl_with_progress(
            &mdb_path_buf,
            &conn,
            &cover_storage,
            |processed, total| {
                let percent = if total == 0 {
                    0.0
                } else {
                    (processed as f64 / total as f64) * 100.0
                };

                let _ = app_handle.emit(
                    "mdb-import-progress",
                    ImportProgressPayload {
                        processed,
                        total,
                        percent,
                    },
                );
            },
        )?;

        db::upsert_meta(
            &conn,
            db::META_KEY_SOURCE_MDB_PATH,
            mdb_path_buf.to_string_lossy().as_ref(),
        )?;

        Ok(imported_count)
    })
    .await
    .map_err(|e| format!("Import task failed: {}", e))?
}

#[tauri::command]
async fn create_archive() -> Result<String, String> {
    let db_path = db::resolve_db_path()?;
    if !db_path.is_absolute() {
        return Err(
            "Invalid database path: archive creation requires an absolute database path"
                .to_string(),
        );
    }

    let data_dir = db_path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .ok_or("Invalid database path: no parent directory")?
        .to_path_buf();
    let db_path_for_archive = db_path.clone();

    tauri::async_runtime::spawn_blocking(move || {
        archive::create_archive_with_date_suffix(&data_dir, &db_path_for_archive)
            .map(|path| path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("Archive task failed: {}", e))?
}

/// Import an MDB file into a deterministic temporary directory for parser debugging.
///
/// The temporary directory is deleted before every run so stale DB or cover files
/// cannot mask parser issues.
pub fn run_debug_import_to_temp(mdb_path: &Path) -> Result<usize, String> {
    if !mdb_path.exists() {
        return Err(format!("MDB file does not exist: {}", mdb_path.display()));
    }

    let tmp_root = env::temp_dir().join(DEBUG_IMPORT_TEMP_DIR);
    if tmp_root.exists() {
        fs::remove_dir_all(&tmp_root).map_err(|e| {
            format!(
                "Failed to clean temp directory {}: {}",
                tmp_root.display(),
                e
            )
        })?;
    }
    fs::create_dir_all(&tmp_root).map_err(|e| {
        format!(
            "Failed to create temp directory {}: {}",
            tmp_root.display(),
            e
        )
    })?;

    let db_path = tmp_root.join("debug.sqlite");
    let cover_storage = CoverStorage::new(&db_path)?;

    db::init_db_if_needed(&db_path)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    log::info!("debug import temp root: {}", tmp_root.display());
    log::info!("debug import sqlite: {}", db_path.display());

    let imported = mdb_import::import_mdb_impl_with_progress(
        mdb_path,
        &conn,
        &cover_storage,
        |processed, total| {
            if processed == 0 || processed % 250 == 0 || processed == total {
                log::info!("import progress: {processed}/{total}");
            }
        },
    )?;

    db::upsert_meta(
        &conn,
        db::META_KEY_SOURCE_MDB_PATH,
        mdb_path.to_string_lossy().as_ref(),
    )?;

    log::info!("debug import finished, imported rows: {imported}");
    Ok(imported)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_path = db::resolve_db_path().expect("Failed to resolve database path");
    db::init_db_if_needed(&db_path).expect("Failed to initialize database");
    let cover_storage = CoverStorage::new(&db_path).expect("Failed to initialize cover storage");

    let manager = SqliteConnectionManager::file(&db_path)
        .with_init(|conn| db::register_spanish_collation(conn));
    let pool = Pool::new(manager).expect("Failed to create connection pool");

    let app_state = AppState {
        db_pool: pool,
        cover_storage,
    };

    tauri::Builder::default()
        .manage(app_state)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_total_records,
            get_record,
            get_groups_and_titles,
            find_record_offset,
            add_record,
            update_record,
            delete_record,
            save_cover_paste,
            save_cover_paste_from_clipboard,
            search_cover_candidates,
            import_cover_from_url,
            copy_cover_to_clipboard,
            delete_cover_for_record,
            get_covers_dir,
            is_db_empty,
            check_for_updates,
            import_mdb,
            create_archive,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            if let Err(error) = apply_adaptive_window_size(app.handle()) {
                log::warn!("adaptive window sizing failed: {error}");
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_unique_tmp_dir(label: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time went backwards")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("vinylvault-lib-{label}-{nanos}"));
        fs::create_dir_all(&dir).expect("failed to create temp directory");
        dir
    }

    fn setup_cover_storage_for_test(label: &str) -> (PathBuf, CoverStorage) {
        let root = make_unique_tmp_dir(label);
        let db_path = root.join("discos.sqlite");
        let storage = CoverStorage::new(&db_path).expect("cover storage init failed");
        (root, storage)
    }

    fn setup_test_db() -> Connection {
        let conn = Connection::open(":memory:").expect("Failed to create in-memory DB");
        db::init_test_schema(&conn).expect("Failed to initialize test schema");
        conn
    }

    #[test]
    fn test_get_total_records_empty_db() {
        let conn = setup_test_db();
        let count = get_total_records_impl(&conn).expect("Query failed");
        assert_eq!(count, 0);
    }

    #[test]
    fn test_add_record() {
        let conn = setup_test_db();
        let offset = add_record_impl(&conn).expect("Add failed");
        assert_eq!(offset, 0);

        let count = get_total_records_impl(&conn).expect("Count failed");
        assert_eq!(count, 1);
    }

    #[test]
    fn test_get_record() {
        let conn = setup_test_db();
        add_record_impl(&conn).expect("Add failed");

        let record = get_record_impl(&conn, 0).expect("Get failed");
        assert_eq!(record.id, 1);
        assert_eq!(record.artist, Some("Nuevo Grupo".to_string()));
        assert_eq!(record.title, Some("Nuevo Disco".to_string()));
    }

    #[test]
    fn test_get_record_uses_artist_year_order() {
        let conn = setup_test_db();
        conn.execute(
            "INSERT INTO albums (artist, title, year) VALUES (?1, ?2, ?3)",
            rusqlite::params!["ZZZ Group", "Old Album", "1990"],
        )
        .expect("Insert failed");
        conn.execute(
            "INSERT INTO albums (artist, title, year) VALUES (?1, ?2, ?3)",
            rusqlite::params!["AAA Group", "Late Album", "2005"],
        )
        .expect("Insert failed");
        conn.execute(
            "INSERT INTO albums (artist, title, year) VALUES (?1, ?2, ?3)",
            rusqlite::params!["AAA Group", "Early Album", "1998"],
        )
        .expect("Insert failed");

        let first = get_record_impl(&conn, 0).expect("Get failed");
        let second = get_record_impl(&conn, 1).expect("Get failed");
        let third = get_record_impl(&conn, 2).expect("Get failed");

        // Sorted by artist asc, then year asc
        assert_eq!(first.artist, Some("AAA Group".to_string()));
        assert_eq!(first.year, Some("1998".to_string()));
        assert_eq!(second.artist, Some("AAA Group".to_string()));
        assert_eq!(second.year, Some("2005".to_string()));
        assert_eq!(third.artist, Some("ZZZ Group".to_string()));
        assert_eq!(third.year, Some("1990".to_string()));
    }

    #[test]
    fn test_get_record_uses_spanish_collation_order() {
        let conn = setup_test_db();
        conn.execute(
            "INSERT INTO albums (artist, title, year) VALUES (?1, ?2, ?3)",
            rusqlite::params!["Oscar", "One", "2000"],
        )
        .expect("Insert failed");
        conn.execute(
            "INSERT INTO albums (artist, title, year) VALUES (?1, ?2, ?3)",
            rusqlite::params!["Ñu", "Two", "2000"],
        )
        .expect("Insert failed");
        conn.execute(
            "INSERT INTO albums (artist, title, year) VALUES (?1, ?2, ?3)",
            rusqlite::params!["Nube", "Three", "2000"],
        )
        .expect("Insert failed");
        conn.execute(
            "INSERT INTO albums (artist, title, year) VALUES (?1, ?2, ?3)",
            rusqlite::params!["Abeja", "Four", "2000"],
        )
        .expect("Insert failed");
        conn.execute(
            "INSERT INTO albums (artist, title, year) VALUES (?1, ?2, ?3)",
            rusqlite::params!["Águila", "Five", "2000"],
        )
        .expect("Insert failed");

        let first = get_record_impl(&conn, 0).expect("Get failed");
        let second = get_record_impl(&conn, 1).expect("Get failed");
        let third = get_record_impl(&conn, 2).expect("Get failed");
        let fourth = get_record_impl(&conn, 3).expect("Get failed");
        let fifth = get_record_impl(&conn, 4).expect("Get failed");

        assert_eq!(first.artist, Some("Abeja".to_string()));
        assert_eq!(second.artist, Some("Águila".to_string()));
        assert_eq!(third.artist, Some("Nube".to_string()));
        assert_eq!(fourth.artist, Some("Ñu".to_string()));
        assert_eq!(fifth.artist, Some("Oscar".to_string()));
    }

    #[test]
    fn test_update_record() {
        let conn = setup_test_db();
        add_record_impl(&conn).expect("Add failed");

        let mut record = get_record_impl(&conn, 0).expect("Get failed");
        record.artist = Some("Updated Grupo".to_string());
        update_record_impl(&conn, record).expect("Update failed");

        let updated = get_record_impl(&conn, 0).expect("Get failed");
        assert_eq!(updated.artist, Some("Updated Grupo".to_string()));
    }

    #[test]
    fn test_delete_record() {
        let conn = setup_test_db();
        add_record_impl(&conn).expect("Add failed");
        let record = get_record_impl(&conn, 0).expect("Get failed");

        delete_record_impl(&conn, record.id).expect("Delete failed");

        let count = get_total_records_impl(&conn).expect("Count failed");
        assert_eq!(count, 0);
    }

    #[test]
    fn test_find_record_offset() {
        let conn = setup_test_db();
        add_record_impl(&conn).expect("Add failed");

        // Update with a recognizable artist
        let mut record = get_record_impl(&conn, 0).expect("Get failed");
        record.artist = Some("Test Banda".to_string());
        update_record_impl(&conn, record).expect("Update failed");

        let offset = find_record_offset_impl(&conn, "artist".to_string(), "Test Banda".to_string())
            .expect("Find failed");
        assert_eq!(offset, 0);
    }

    #[test]
    fn test_get_groups_and_titles() {
        let conn = setup_test_db();
        add_record_impl(&conn).expect("Add failed");

        let result = get_groups_and_titles_impl(&conn).expect("Query failed");
        assert_eq!(result.groups.len(), 1);
        assert_eq!(result.groups[0], "Nuevo Grupo");
        assert_eq!(result.titles.len(), 1);
        assert_eq!(result.titles[0], "Nuevo Disco");
    }

    #[test]
    fn test_save_cover_from_rgba_updates_db_and_returns_absolute_path() {
        let conn = setup_test_db();
        conn.execute(
            "INSERT INTO albums (artist, title) VALUES (?1, ?2)",
            rusqlite::params!["The Artist", "Test Album"],
        )
        .expect("insert failed");

        let (root, cover_storage) = setup_cover_storage_for_test("save-cover");

        let abs_path =
            save_cover_from_rgba_impl(&conn, &cover_storage, 1, vec![255, 0, 0, 255], 1, 1, "cd")
                .expect("save cover failed");

        let stored_rel: String = conn
            .query_row(
                "SELECT cd_cover_path FROM albums WHERE rowid=?1",
                [1],
                |row| row.get(0),
            )
            .expect("failed to query stored cover path");

        assert!(stored_rel.starts_with("covers/"));
        assert!(Path::new(&abs_path).is_absolute());
        assert!(Path::new(&abs_path).exists());

        fs::remove_dir_all(&root).expect("failed to clean temp directory");
    }

    #[test]
    fn test_save_cover_from_rgba_rejects_invalid_suffix() {
        let conn = setup_test_db();
        conn.execute(
            "INSERT INTO albums (artist, title) VALUES (?1, ?2)",
            rusqlite::params!["The Artist", "Test Album"],
        )
        .expect("insert failed");

        let (root, cover_storage) = setup_cover_storage_for_test("invalid-save-suffix");

        let err = save_cover_from_rgba_impl(
            &conn,
            &cover_storage,
            1,
            vec![255, 0, 0, 255],
            1,
            1,
            "cassette",
        )
        .expect_err("expected invalid suffix to fail");

        assert!(err.contains("Invalid suffix"));

        fs::remove_dir_all(&root).expect("failed to clean temp directory");
    }

    #[test]
    fn test_delete_cover_for_record_deletes_file_and_clears_column() {
        let conn = setup_test_db();
        conn.execute(
            "INSERT INTO albums (artist, title, cd_cover_path) VALUES (?1, ?2, ?3)",
            rusqlite::params!["The Artist", "Test Album", "covers/te/test_cd_deadbe.jpg"],
        )
        .expect("insert failed");

        let (root, cover_storage) = setup_cover_storage_for_test("delete-cover");
        let abs_cover = root.join("covers/te/test_cd_deadbe.jpg");
        fs::create_dir_all(abs_cover.parent().expect("parent missing"))
            .expect("failed to create cover folder");
        fs::write(&abs_cover, [1u8, 2u8, 3u8]).expect("failed to write fake cover");

        delete_cover_for_record_impl(&conn, &cover_storage, 1, "cd").expect("delete cover failed");

        let stored: Option<String> = conn
            .query_row(
                "SELECT cd_cover_path FROM albums WHERE rowid=?1",
                [1],
                |row| row.get(0),
            )
            .expect("failed to query stored path after delete");

        assert!(stored.is_none());
        assert!(!abs_cover.exists());

        fs::remove_dir_all(&root).expect("failed to clean temp directory");
    }

    #[test]
    fn test_delete_cover_for_record_rejects_invalid_suffix() {
        let conn = setup_test_db();
        conn.execute(
            "INSERT INTO albums (artist, title) VALUES (?1, ?2)",
            rusqlite::params!["The Artist", "Test Album"],
        )
        .expect("insert failed");

        let (root, cover_storage) = setup_cover_storage_for_test("invalid-delete-suffix");

        let err = delete_cover_for_record_impl(&conn, &cover_storage, 1, "tape")
            .expect_err("expected invalid suffix to fail");

        assert!(err.contains("Invalid suffix"));

        fs::remove_dir_all(&root).expect("failed to clean temp directory");
    }
}
