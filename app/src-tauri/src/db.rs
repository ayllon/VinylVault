use rusqlite::Connection;
use std::env;
use std::path::{Path, PathBuf};

use crate::collation::compare_spanish;

pub const DB_SCHEMA_VERSION: &str = "1";
pub const META_KEY_SCHEMA_VERSION: &str = "schema_version";
pub const META_KEY_SOURCE_MDB_PATH: &str = "source_mdb_path";

const IDX_ARTIST_LEGACY: &str = "idx_albums_artist";
const IDX_TITLE_LEGACY: &str = "idx_albums_title";
const IDX_ARTIST_YEAR_LEGACY: &str = "idx_albums_artist_year";
const IDX_ARTIST_SPANISH: &str = "idx_albums_artist_spanish";
const IDX_TITLE_SPANISH: &str = "idx_albums_title_spanish";
const IDX_ARTIST_YEAR_SPANISH: &str = "idx_albums_artist_year_spanish";

pub fn register_spanish_collation(conn: &Connection) -> rusqlite::Result<()> {
    conn.create_collation("SPANISH", compare_spanish)
}

/// Resolve the database path from the environment or the default location.
pub fn resolve_db_path() -> Result<PathBuf, String> {
    if let Ok(path) = env::var("VINYLVAULT_DB_PATH") {
        Ok(PathBuf::from(path))
    } else {
        let home = dirs::home_dir().ok_or("Cannot determine home directory")?;
        Ok(home.join("discos").join("discos.sqlite"))
    }
}

/// Create the database directory and initial schema if they do not yet exist,
/// and ensure required indexes and meta information are present.
pub fn init_db_if_needed(db_path: &Path) -> Result<(), String> {
    let dir = db_path
        .parent()
        .ok_or("Invalid database path: no parent directory")?;

    std::fs::create_dir_all(dir).map_err(|e| format!("Failed to create DB directory: {}", e))?;

    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;
    register_spanish_collation(&conn).map_err(|e| e.to_string())?;

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

        conn.execute(
            &format!("CREATE INDEX {IDX_ARTIST_SPANISH} ON albums (artist COLLATE SPANISH)"),
            [],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            &format!("CREATE INDEX {IDX_TITLE_SPANISH} ON albums (title COLLATE SPANISH)"),
            [],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            &format!(
                "CREATE INDEX {IDX_ARTIST_YEAR_SPANISH} ON albums (artist COLLATE SPANISH, year)"
            ),
            [],
        )
        .map_err(|e| e.to_string())?;
    }

    ensure_meta_schema(&conn)?;
    ensure_indexes(&conn)?;
    set_meta_if_missing(&conn, META_KEY_SCHEMA_VERSION, DB_SCHEMA_VERSION)?;

    Ok(())
}

fn ensure_indexes(conn: &Connection) -> Result<(), String> {
    // Keep index migration idempotent across app startups.
    conn.execute(
        &format!(
            "CREATE INDEX IF NOT EXISTS {IDX_ARTIST_SPANISH} ON albums (artist COLLATE SPANISH)"
        ),
        [],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        &format!(
            "CREATE INDEX IF NOT EXISTS {IDX_TITLE_SPANISH} ON albums (title COLLATE SPANISH)"
        ),
        [],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        &format!(
            "CREATE INDEX IF NOT EXISTS {IDX_ARTIST_YEAR_SPANISH} ON albums (artist COLLATE SPANISH, year)"
        ),
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(&format!("DROP INDEX IF EXISTS {IDX_ARTIST_LEGACY}"), [])
        .map_err(|e| e.to_string())?;
    conn.execute(&format!("DROP INDEX IF EXISTS {IDX_TITLE_LEGACY}"), [])
        .map_err(|e| e.to_string())?;
    conn.execute(
        &format!("DROP INDEX IF EXISTS {IDX_ARTIST_YEAR_LEGACY}"),
        [],
    )
    .map_err(|e| e.to_string())?;

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
    register_spanish_collation(conn).map_err(|e| e.to_string())?;

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

    conn.execute(
        &format!("CREATE INDEX {IDX_ARTIST_SPANISH} ON albums (artist COLLATE SPANISH)"),
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        &format!("CREATE INDEX {IDX_TITLE_SPANISH} ON albums (title COLLATE SPANISH)"),
        [],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        &format!("CREATE INDEX {IDX_ARTIST_YEAR_SPANISH} ON albums (artist COLLATE SPANISH, year)"),
        [],
    )
    .map_err(|e| e.to_string())?;

    ensure_meta_schema(conn)?;
    set_meta_if_missing(conn, META_KEY_SCHEMA_VERSION, DB_SCHEMA_VERSION)?;

    Ok(())
}
