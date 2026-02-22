use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_sql::{Migration, MigrationKind};

/// Rename pluely.db → freely.db in the app data directory for existing users.
///
/// Runs before the SQL plugin opens its connection. Only renames when:
/// - `pluely.db` exists, AND
/// - `freely.db` does NOT yet exist (prevents clobbering a fresh install)
///
/// Logs a warning on failure but never panics — a missing migration is
/// survivable (the user gets a fresh DB) whereas a hard crash is not.
pub fn migrate_legacy_db(app: &tauri::App) {
    let data_dir: PathBuf = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(e) => {
            eprintln!("[db] Could not resolve app data directory for legacy migration: {e}");
            return;
        }
    };

    let old_path = data_dir.join("pluely.db");
    let new_path = data_dir.join("freely.db");

    if old_path.exists() && !new_path.exists() {
        match std::fs::rename(&old_path, &new_path) {
            Ok(()) => println!("[db] Migrated pluely.db → freely.db"),
            Err(e) => eprintln!("[db] Failed to rename pluely.db → freely.db: {e}"),
        }
    }
}

/// Returns all database migrations
pub fn migrations() -> Vec<Migration> {
    vec![
        // Migration 1: Create system_prompts table with indexes and triggers
        Migration {
            version: 1,
            description: "create_system_prompts_table",
            sql: include_str!("migrations/system-prompts.sql"),
            kind: MigrationKind::Up,
        },
        // Migration 2: Create chat history tables (conversations and messages)
        Migration {
            version: 2,
            description: "create_chat_history_tables",
            sql: include_str!("migrations/chat-history.sql"),
            kind: MigrationKind::Up,
        },
    ]
}
