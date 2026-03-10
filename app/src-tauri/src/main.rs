// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::Path;

fn main() {
    let mut args = std::env::args();
    let _bin = args.next();

    if let Some(command) = args.next() {
        if command == "import-mdb-debug" {
            env_logger::Builder::from_env(
                env_logger::Env::default().default_filter_or("info,jetdb=debug"),
            )
            .format_timestamp_millis()
            .init();

            let mdb_path = match args.next() {
                Some(path) => path,
                None => {
                    eprintln!(
                        "Usage: cargo run --bin vinylvault -- import-mdb-debug <path-to-mdb>"
                    );
                    std::process::exit(2);
                }
            };

            match vinylvault_lib::run_debug_import_to_temp(Path::new(&mdb_path)) {
                Ok(imported) => {
                    println!("Debug import completed successfully. Imported rows: {imported}");
                    std::process::exit(0);
                }
                Err(err) => {
                    eprintln!("Debug import failed: {err}");
                    std::process::exit(1);
                }
            }
        }
    }

    vinylvault_lib::run();
}
