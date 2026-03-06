use rusqlite::Connection;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Default)]
pub struct Record {
    id: i64,
    grupo: Option<String>,
    titulo: Option<String>,
    formato: Option<String>,
    anio: Option<String>,
    estilo: Option<String>,
    pais: Option<String>,
    canciones: Option<String>,
    creditos: Option<String>,
    observ: Option<String>,
}

#[tauri::command]
fn get_total_records(db_path: String) -> Result<u32, String> {
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    // We order by somewhat stable, or just rowid
    let count: u32 = conn
        .query_row("SELECT COUNT(*) FROM discos", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    Ok(count)
}

#[tauri::command]
fn get_record(offset: u32, db_path: String) -> Result<Record, String> {
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    // SQLite offsets are 0-based
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

#[tauri::command]
fn get_groups_and_titles(
    db_path: String,
) -> Result<(Vec<String>, Vec<String>, Vec<String>), String> {
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

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

#[tauri::command]
fn find_record_offset(column: String, value: String, db_path: String) -> Result<u32, String> {
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    // Safety: column must be GRUPO or TITULO
    let col = if column == "GRUPO" { "GRUPO" } else { "TITULO" };

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

#[tauri::command]
fn add_record(db_path: String) -> Result<u32, String> {
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
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

#[tauri::command]
fn update_record(record: Record, db_path: String) -> Result<(), String> {
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE discos SET GRUPO=?1, TITULO=?2, FORMATO=?3, ANIO=?4, ESTILO=?5, PAIS=?6, CANCIONES=?7, CREDITOS=?8, OBSERV=?9 WHERE rowid=?10",
        rusqlite::params![record.grupo, record.titulo, record.formato, record.anio, record.estilo, record.pais, record.canciones, record.creditos, record.observ, record.id]
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_record(id: i64, db_path: String) -> Result<(), String> {
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM discos WHERE rowid=?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
