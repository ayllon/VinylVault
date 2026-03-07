mod mdb_import;

use r2d2::Pool;
use r2d2_sqlite::SqliteConnectionManager;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::env;
use std::path::{Path, PathBuf};
use tauri::State;

#[derive(Clone)]
struct AppState {
    db_pool: Pool<SqliteConnectionManager>,
}

#[derive(Serialize, Deserialize, Default, Clone)]
pub struct Record {
    pub id: i64,
    pub grupo: Option<String>,
    pub titulo: Option<String>,
    pub formato: Option<String>,
    pub anio: Option<String>,
    pub estilo: Option<String>,
    pub pais: Option<String>,
    pub canciones: Option<String>,
    pub creditos: Option<String>,
    pub observ: Option<String>,
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
            "SELECT name FROM sqlite_master WHERE type='table' AND name='discos'",
            [],
            |_| Ok(true),
        )
        .unwrap_or(false);

    if !table_exists {
        conn.execute(
            "CREATE TABLE discos (
                GRUPO TEXT,
                TITULO TEXT,
                FORMATO TEXT,
                ANIO TEXT,
                ESTILO TEXT,
                PAIS TEXT,
                CANCIONES TEXT,
                CREDITOS TEXT,
                OBSERV TEXT
            )",
            [],
        )
        .map_err(|e| e.to_string())?;

        conn.execute("CREATE INDEX idx_discos_grupo ON discos (GRUPO)", [])
            .map_err(|e| e.to_string())?;

        conn.execute("CREATE INDEX idx_discos_titulo ON discos (TITULO)", [])
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

// Helper: initialize schema in a test connection (for tests)
#[cfg(test)]
fn init_test_schema(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "CREATE TABLE discos (
            GRUPO TEXT,
            TITULO TEXT,
            FORMATO TEXT,
            ANIO TEXT,
            ESTILO TEXT,
            PAIS TEXT,
            CANCIONES TEXT,
            CREDITOS TEXT,
            OBSERV TEXT
        )",
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute("CREATE INDEX idx_discos_grupo ON discos (GRUPO)", [])
        .map_err(|e| e.to_string())?;

    conn.execute("CREATE INDEX idx_discos_titulo ON discos (TITULO)", [])
        .map_err(|e| e.to_string())?;

    Ok(())
}

// Implementation functions (testable, take &Connection)

fn get_total_records_impl(conn: &Connection) -> Result<u32, String> {
    let count: u32 = conn
        .query_row("SELECT COUNT(*) FROM discos", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    Ok(count)
}

fn get_record_impl(conn: &Connection, offset: u32) -> Result<Record, String> {
    let mut stmt = conn
        .prepare(
            "SELECT rowid, GRUPO, TITULO, FORMATO, ANIO, ESTILO, PAIS, CANCIONES, CREDITOS, OBSERV 
         FROM discos ORDER BY rowid LIMIT 1 OFFSET ?",
        )
        .map_err(|e| e.to_string())?;

    let mut rows = stmt.query([offset]).map_err(|e| e.to_string())?;
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let record = Record {
            id: row.get(0).unwrap_or(0),
            grupo: row.get(1).unwrap_or(None),
            titulo: row.get(2).unwrap_or(None),
            formato: row.get(3).unwrap_or(None),
            anio: row.get(4).unwrap_or(None),
            estilo: row.get(5).unwrap_or(None),
            pais: row.get(6).unwrap_or(None),
            canciones: row.get(7).unwrap_or(None),
            creditos: row.get(8).unwrap_or(None),
            observ: row.get(9).unwrap_or(None),
        };
        Ok(record)
    } else {
        Err("Record not found".to_string())
    }
}

fn get_groups_and_titles_impl(
    conn: &Connection,
) -> Result<(Vec<String>, Vec<String>, Vec<String>), String> {
    let mut groups = Vec::new();
    let mut stmt = conn.prepare("SELECT DISTINCT GRUPO FROM discos WHERE GRUPO IS NOT NULL AND GRUPO != '' ORDER BY GRUPO").map_err(|e| e.to_string())?;
    let mut rows = stmt.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows.next().map_err(|e| e.to_string())? {
        if let Ok(g) = row.get::<_, String>(0) {
            groups.push(g);
        }
    }

    let mut titles = Vec::new();
    let mut stmt2 = conn.prepare("SELECT DISTINCT TITULO FROM discos WHERE TITULO IS NOT NULL AND TITULO != '' ORDER BY TITULO").map_err(|e| e.to_string())?;
    let mut rows2 = stmt2.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows2.next().map_err(|e| e.to_string())? {
        if let Ok(t) = row.get::<_, String>(0) {
            titles.push(t);
        }
    }

    let mut formatos = Vec::new();
    let mut stmt3 = conn.prepare("SELECT DISTINCT FORMATO FROM discos WHERE FORMATO IS NOT NULL AND FORMATO != '' ORDER BY FORMATO").map_err(|e| e.to_string())?;
    let mut rows3 = stmt3.query([]).map_err(|e| e.to_string())?;
    while let Some(row) = rows3.next().map_err(|e| e.to_string())? {
        if let Ok(f) = row.get::<_, String>(0) {
            formatos.push(f);
        }
    }

    Ok((groups, titles, formatos))
}

fn find_record_offset_impl(conn: &Connection, column: String, value: String) -> Result<u32, String> {
    // Safety: column must be GRUPO or TITULO
    let col = match column.as_str() {
        "GRUPO" => "GRUPO",
        "TITULO" => "TITULO",
        _ => return Err(format!("Invalid column: {}", column)),
    };

    let query = format!(
        "SELECT (SELECT COUNT(*) FROM discos AS d2 WHERE d2.rowid < discos.rowid) AS offset 
         FROM discos WHERE {} = ? ORDER BY rowid LIMIT 1",
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
        "INSERT INTO discos (GRUPO, TITULO) VALUES ('Nuevo Grupo', 'Nuevo Disco')",
        [],
    )
    .map_err(|e| e.to_string())?;
    let count: u32 = conn
        .query_row("SELECT COUNT(*) FROM discos", [], |row| row.get(0))
        .unwrap_or(1);
    Ok(count - 1)
}

fn update_record_impl(conn: &Connection, record: Record) -> Result<(), String> {
    conn.execute(
        "UPDATE discos SET GRUPO=?1, TITULO=?2, FORMATO=?3, ANIO=?4, ESTILO=?5, PAIS=?6, CANCIONES=?7, CREDITOS=?8, OBSERV=?9 WHERE rowid=?10",
        rusqlite::params![record.grupo, record.titulo, record.formato, record.anio, record.estilo, record.pais, record.canciones, record.creditos, record.observ, record.id]
    ).map_err(|e| e.to_string())?;
    Ok(())
}

fn delete_record_impl(conn: &Connection, id: i64) -> Result<(), String> {
    conn.execute("DELETE FROM discos WHERE rowid=?1", [id])
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
fn get_groups_and_titles(state: State<AppState>) -> Result<(Vec<String>, Vec<String>, Vec<String>), String> {
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
fn import_mdb(mdb_path: String, state: State<AppState>) -> Result<usize, String> {
    let conn = state.db_pool.get().map_err(|e| e.to_string())?;
    
    let db_path = resolve_db_path()?;
    let covers_dir = db_path
        .parent()
        .ok_or("Invalid database path")?;
    let covers_path = covers_dir.join("covers");
    
    mdb_import::import_mdb_impl(
        std::path::Path::new(&mdb_path),
        &conn,
        &covers_path,
    )
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
        assert_eq!(record.grupo, Some("Nuevo Grupo".to_string()));
        assert_eq!(record.titulo, Some("Nuevo Disco".to_string()));
    }

    #[test]
    fn test_update_record() {
        let conn = setup_test_db();
        add_record_impl(&conn).expect("Add failed");

        let mut record = get_record_impl(&conn, 0).expect("Get failed");
        record.grupo = Some("Updated Grupo".to_string());
        update_record_impl(&conn, record).expect("Update failed");

        let updated = get_record_impl(&conn, 0).expect("Get failed");
        assert_eq!(updated.grupo, Some("Updated Grupo".to_string()));
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

        // Update with a recognizable grupo
        let mut record = get_record_impl(&conn, 0).expect("Get failed");
        record.grupo = Some("Test Banda".to_string());
        update_record_impl(&conn, record).expect("Update failed");

        let offset = find_record_offset_impl(&conn, "GRUPO".to_string(), "Test Banda".to_string())
            .expect("Find failed");
        assert_eq!(offset, 0);
    }

    #[test]
    fn test_get_groups_and_titles() {
        let conn = setup_test_db();
        add_record_impl(&conn).expect("Add failed");

        let (groups, titles, _) = get_groups_and_titles_impl(&conn).expect("Query failed");
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0], "Nuevo Grupo");
        assert_eq!(titles.len(), 1);
        assert_eq!(titles[0], "Nuevo Disco");
    }
}
