use rusqlite::Connection;
use std::env;
use std::path::{Path, PathBuf};

pub const DB_SCHEMA_VERSION: &str = "2";
pub const META_KEY_SCHEMA_VERSION: &str = "schema_version";
pub const META_KEY_SOURCE_MDB_PATH: &str = "source_mdb_path";

/// Resolve the database path from the environment or the default location.
pub fn resolve_db_path() -> Result<PathBuf, String> {
    if let Ok(path) = env::var("VINYLVAULT_DB_PATH") {
        Ok(PathBuf::from(path))
    } else {
        let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
        Ok(home.join("discos").join("discos.sqlite"))
    }
}

/// Create the database directory and schema if they do not yet exist, then run
/// any pending migrations.
pub fn init_db_if_needed(db_path: &Path) -> Result<(), String> {
    let dir = db_path
        .parent()
        .ok_or("Invalid database path: no parent directory")?;

    std::fs::create_dir_all(dir).map_err(|e| format!("Failed to create DB directory: {}", e))?;

    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

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

        conn.execute(
            "CREATE INDEX idx_albums_artist_year ON albums (artist, year)",
            [],
        )
        .map_err(|e| e.to_string())?;
    }

    ensure_meta_schema(&conn)?;
    set_meta_if_missing(&conn, META_KEY_SCHEMA_VERSION, DB_SCHEMA_VERSION)?;
    run_migrations(&conn)?;

    Ok(())
}

fn run_migrations(conn: &Connection) -> Result<(), String> {
    let current_version: String = conn
        .query_row(
            "SELECT value FROM meta WHERE key = ?1",
            rusqlite::params![META_KEY_SCHEMA_VERSION],
            |row| row.get(0),
        )
        .unwrap_or_else(|_| "1".to_string());

    let version: u32 = current_version.parse().unwrap_or(1);

    if version < 2 {
        // Migration 1 → 2: replace idx_albums_title with idx_albums_artist_year
        conn.execute("DROP INDEX IF EXISTS idx_albums_title", [])
            .map_err(|e| e.to_string())?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_albums_artist_year ON albums (artist, year)",
            [],
        )
        .map_err(|e| e.to_string())?;
        upsert_meta(conn, META_KEY_SCHEMA_VERSION, "2")?;
    }

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

pub fn upsert_meta(conn: &Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
pub fn init_test_schema(conn: &Connection) -> Result<(), String> {
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

    conn.execute(
        "CREATE INDEX idx_albums_artist_year ON albums (artist, year)",
        [],
    )
    .map_err(|e| e.to_string())?;

    ensure_meta_schema(conn)?;
    set_meta_if_missing(conn, META_KEY_SCHEMA_VERSION, DB_SCHEMA_VERSION)?;

    Ok(())
}
