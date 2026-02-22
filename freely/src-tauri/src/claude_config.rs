//! Claude Code CLI configuration management.
//!
//! Manages a `.claude/` directory in the app's local data directory.
//! On first run, creates default CLAUDE.md and settings.json files.
//! Subsequent runs leave existing files untouched so users can customize them.

use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

const DEFAULT_CLAUDE_MD: &str = r#"# Freely Assistant

You are an AI coding assistant running inside Freely, a desktop development tool.

## Context
- You are running as an agent provider inside the Freely desktop app
- The user interacts with you through Freely's chat interface
- You have access to the user's filesystem through Claude Code's built-in tools

## Guidelines
- Be concise and helpful
- Focus on the user's coding task
- When modifying files, explain what you changed and why
- Respect the user's project structure and conventions
"#;

const DEFAULT_SETTINGS_JSON: &str = r#"{
  "permissions": {
    "allow": ["Read", "Glob", "Grep", "Bash(git status)", "Bash(git diff)"],
    "deny": []
  }
}
"#;

/// Initialize the `.claude` config directory in the app's local data directory.
///
/// Creates `CLAUDE.md` and `settings.json` only if they do not already exist,
/// preserving any edits the user may have made. Returns the path to the `.claude/`
/// directory so callers can set it as the working directory for the Claude CLI.
pub fn init_claude_config(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Could not resolve app_local_data_dir: {}", e))?;

    let claude_dir = data_dir.join(".claude");

    std::fs::create_dir_all(&claude_dir)
        .map_err(|e| format!("Failed to create .claude directory: {}", e))?;

    // Write CLAUDE.md only on first run
    let claude_md_path = claude_dir.join("CLAUDE.md");
    if !claude_md_path.exists() {
        std::fs::write(&claude_md_path, DEFAULT_CLAUDE_MD)
            .map_err(|e| format!("Failed to write CLAUDE.md: {}", e))?;
    }

    // Write settings.json only on first run
    let settings_path = claude_dir.join("settings.json");
    if !settings_path.exists() {
        std::fs::write(&settings_path, DEFAULT_SETTINGS_JSON)
            .map_err(|e| format!("Failed to write settings.json: {}", e))?;
    }

    Ok(claude_dir)
}

/// Read the current CLAUDE.md content from the app's `.claude` config directory.
#[tauri::command]
pub fn get_claude_md(app: AppHandle) -> Result<String, String> {
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Could not resolve app_local_data_dir: {}", e))?;

    let claude_md_path = data_dir.join(".claude").join("CLAUDE.md");

    std::fs::read_to_string(&claude_md_path)
        .map_err(|e| format!("Failed to read CLAUDE.md: {}", e))
}

/// Write new CLAUDE.md content to the app's `.claude` config directory.
#[tauri::command]
pub fn update_claude_md(app: AppHandle, content: String) -> Result<(), String> {
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("Could not resolve app_local_data_dir: {}", e))?;

    let claude_dir = data_dir.join(".claude");

    std::fs::create_dir_all(&claude_dir)
        .map_err(|e| format!("Failed to create .claude directory: {}", e))?;

    let claude_md_path = claude_dir.join("CLAUDE.md");

    std::fs::write(&claude_md_path, content)
        .map_err(|e| format!("Failed to write CLAUDE.md: {}", e))
}
