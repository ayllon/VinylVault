mod mdb_import;
mod sanitize;

use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{Emitter, State};

const DB_SCHEMA_VERSION: &str = "1";
const META_KEY_SCHEMA_VERSION: &str = "schema_version";
const META_KEY_SOURCE_MDB_PATH: &str = "source_mdb_path";
const DEBUG_IMPORT_TEMP_DIR: &str = "vinylvault-mdb-import-debug";

#[derive(Clone)]
struct AppState {
    db_pool: Pool<SqliteConnectionManager>,
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

// Helper: resolve DB path from env or default
fn resolve_db_path() -> Result<PathBuf, String> {
    if let Ok(path) = env::var("VINYLVAULT_DB_PATH") {
        Ok(PathBuf::from(path))
    } else {
        let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
        Ok(home.join("discos").join("discos.sqlite"))
    }
}

// Helper: initialize DB if needed (create dir and schema)
fn init_db_if_needed(db_path: &Path) -> Result<(), String> {
    let dir = db_path
        .parent()
        .ok_or("Invalid database path: no parent directory")?;

    std::fs::create_dir_all(dir).map_err(|e| format!("Failed to create DB directory: {}", e))?;

    // Try to open; if it doesn't exist, SQLite will create it
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    // Check if table exists; if not, create schema
    let table_exists: bool = conn
        .query_row(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='albums'",
            [],
            |_| Ok(true),
        )
        .unwrap_or(false);

    if !table_exists {
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
                edition TEXT,
                notes TEXT,
                cd_cover_path TEXT,
                lp_cover_path TEXT
            )",
            [],
        )
        .map_err(|e| e.to_string())?;

        conn.execute("CREATE INDEX idx_albums_artist ON albums (artist)", [])
            .map_err(|e| e.to_string())?;

        conn.execute("CREATE INDEX idx_albums_title ON albums (title)", [])
            .map_err(|e| e.to_string())?;
    }

    ensure_meta_schema(&conn)?;
    set_meta_if_missing(&conn, META_KEY_SCHEMA_VERSION, DB_SCHEMA_VERSION)?;

    Ok(())
}

fn ensure_meta_schema(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn set_meta_if_missing(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT OR IGNORE INTO meta (key, value) VALUES (?1, ?2)",
        rusqlite::params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn upsert_meta(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// Helper: initialize schema in a test connection (for tests)
#[cfg(test)]
fn init_test_schema(conn: &Connection) -> Result<(), String> {
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
            edition TEXT,
            notes TEXT,
            cd_cover_path TEXT,
            lp_cover_path TEXT
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute("CREATE INDEX idx_albums_artist ON albums (artist)", [])
        .map_err(|e| e.to_string())?;

    conn.execute("CREATE INDEX idx_albums_title ON albums (title)", [])
        .map_err(|e| e.to_string())?;

    ensure_meta_schema(conn)?;
    set_meta_if_missing(conn, META_KEY_SCHEMA_VERSION, DB_SCHEMA_VERSION)?;

    Ok(())
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
            ORDER BY COALESCE(artist, ''), COALESCE(title, ''), rowid
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
    let mut stmt = conn.prepare("SELECT DISTINCT artist FROM albums WHERE artist IS NOT NULL AND artist != '' ORDER BY artist").map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        if let Ok(g) = row.get::<_, String>(0) {
            groups.push(g);
        }
    }

    let mut titles = Vec::new();
    let mut stmt2 = conn.prepare("SELECT DISTINCT title FROM albums WHERE title IS NOT NULL AND title != '' ORDER BY title").map_err(|e| e.to_string())?;
    let mut rows2 = stmt2.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows2.next().map_err(|e| e.to_string())? {
        if let Ok(t) = row.get::<_, String>(0) {
            titles.push(t);
        }
    }

    let mut formatos = Vec::new();
    let mut stmt3 = conn.prepare("SELECT DISTINCT format FROM albums WHERE format IS NOT NULL AND format != '' ORDER BY format").map_err(|e| e.to_string())?;
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
                    ORDER BY COALESCE(artist, ''), COALESCE(title, ''), rowid
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
                           ORDER BY COALESCE(artist, ''), COALESCE(title, ''), rowid
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

// Tauri command handlers (thin wrappers around _impl)

#[tauri::command]
fn get_total_records(state: State<AppState>) -> Result<u32, String> {
    let conn = state.db_pool.get().map_err(|e| e.to_string())?;
    get_total_records_impl(&conn)
}

#[tauri::command]
fn get_record(offset: u32, state: State<AppState>) -> Result<Record, String> {
    let conn = state.db_pool.get().map_err(|e| e.to_string())?;
    get_record_impl(&conn, offset)
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
fn get_covers_dir() -> Result<String, String> {
    let db_path = resolve_db_path()?;
    let covers_dir = db_path
        .parent()
        .ok_or("Invalid database path")?
        .join("covers");
    Ok(covers_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn is_db_empty(state: State<AppState>) -> Result<bool, String> {
    let conn = state.db_pool.get().map_err(|e| e.to_string())?;
    mdb_import::is_db_empty_impl(&conn)
}

#[tauri::command]
async fn import_mdb(
    mdb_path: String,
    state: State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<usize, String> {
    let db_path = resolve_db_path()?;
    let covers_dir = db_path.parent().ok_or("Invalid database path")?;
    let covers_path = covers_dir.join("covers");

    let pool = state.db_pool.clone();
    let app_handle = app.clone();
    let mdb_path_buf = PathBuf::from(mdb_path);

    tauri::async_runtime::spawn_blocking(move || {
        let conn = pool.get().map_err(|e| e.to_string())?;

        let imported_count = mdb_import::import_mdb_impl_with_progress(
            &mdb_path_buf,
            &conn,
            &covers_path,
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

        upsert_meta(
            &conn,
            META_KEY_SOURCE_MDB_PATH,
            mdb_path_buf.to_string_lossy().as_ref(),
        )?;

        Ok(imported_count)
    })
    .await
    .map_err(|e| format!("Import task failed: {}", e))?
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
    let covers_path = tmp_root.join("covers");

    init_db_if_needed(&db_path)?;
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    log::info!("debug import temp root: {}", tmp_root.display());
    log::info!("debug import sqlite: {}", db_path.display());

    let imported = mdb_import::import_mdb_impl_with_progress(
        mdb_path,
        &conn,
        &covers_path,
        |processed, total| {
            if processed == 0 || processed % 250 == 0 || processed == total {
                log::info!("import progress: {processed}/{total}");
            }
        },
    )?;

    upsert_meta(
        &conn,
        META_KEY_SOURCE_MDB_PATH,
        mdb_path.to_string_lossy().as_ref(),
    )?;

    log::info!("debug import finished, imported rows: {imported}");
    Ok(imported)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_path = resolve_db_path().expect("Failed to resolve database path");
    init_db_if_needed(&db_path).expect("Failed to initialize database");

    let manager = SqliteConnectionManager::file(&db_path);
    let pool = Pool::new(manager).expect("Failed to create connection pool");

    let app_state = AppState { db_pool: pool };

    tauri::Builder::default()
        .manage(app_state)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            get_total_records,
            get_record,
            get_groups_and_titles,
            find_record_offset,
            add_record,
            update_record,
            delete_record,
            get_covers_dir,
            is_db_empty,
            import_mdb,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_test_db() -> Connection {
        let conn = Connection::open(":memory:").expect("Failed to create in-memory DB");
        init_test_schema(&conn).expect("Failed to initialize test schema");
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
    fn test_get_record_uses_lexicographical_order() {
        let conn = setup_test_db();
        conn.execute(
            "INSERT INTO albums (artist, title) VALUES (?1, ?2)",
            rusqlite::params!["ZZZ Group", "Alpha"],
        )
        .expect("Insert failed");
        conn.execute(
            "INSERT INTO albums (artist, title) VALUES (?1, ?2)",
            rusqlite::params!["AAA Group", "Zulu"],
        )
        .expect("Insert failed");
        conn.execute(
            "INSERT INTO albums (artist, title) VALUES (?1, ?2)",
            rusqlite::params!["AAA Group", "Beta"],
        )
        .expect("Insert failed");

        let first = get_record_impl(&conn, 0).expect("Get failed");
        let second = get_record_impl(&conn, 1).expect("Get failed");
        let third = get_record_impl(&conn, 2).expect("Get failed");

        assert_eq!(first.artist, Some("AAA Group".to_string()));
        assert_eq!(first.title, Some("Beta".to_string()));
        assert_eq!(second.artist, Some("AAA Group".to_string()));
        assert_eq!(second.title, Some("Zulu".to_string()));
        assert_eq!(third.artist, Some("ZZZ Group".to_string()));
        assert_eq!(third.title, Some("Alpha".to_string()));
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
}
