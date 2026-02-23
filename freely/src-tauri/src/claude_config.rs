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

    init_claude_config_in(data_dir)
}

/// Core logic for initializing the `.claude` config directory under a given
/// data directory. Extracted from [`init_claude_config`] for testability.
pub(crate) fn init_claude_config_in(data_dir: PathBuf) -> Result<PathBuf, String> {
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

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    /// Helper: run init and return (tmp_dir_guard, claude_dir_path).
    fn setup() -> (TempDir, PathBuf) {
        let tmp = TempDir::new().expect("failed to create temp dir");
        let claude_dir = init_claude_config_in(tmp.path().to_path_buf())
            .expect("init_claude_config_in failed");
        (tmp, claude_dir)
    }

    #[test]
    fn creates_claude_directory_and_default_files() {
        let (_tmp, claude_dir) = setup();

        assert!(claude_dir.is_dir(), ".claude directory should exist");
        assert!(
            claude_dir.join("CLAUDE.md").is_file(),
            "CLAUDE.md should be created"
        );
        assert!(
            claude_dir.join("settings.json").is_file(),
            "settings.json should be created"
        );
    }

    #[test]
    fn default_claude_md_contains_expected_content() {
        let (_tmp, claude_dir) = setup();
        let content = std::fs::read_to_string(claude_dir.join("CLAUDE.md")).unwrap();
        assert!(
            content.contains("Freely Assistant"),
            "CLAUDE.md should mention Freely Assistant"
        );
    }

    #[test]
    fn default_settings_json_is_valid_json() {
        let (_tmp, claude_dir) = setup();
        let raw = std::fs::read_to_string(claude_dir.join("settings.json")).unwrap();
        let parsed: serde_json::Value =
            serde_json::from_str(&raw).expect("settings.json should be valid JSON");
        assert!(
            parsed.get("permissions").is_some(),
            "settings.json should have a permissions key"
        );
    }

    #[test]
    fn idempotent_does_not_overwrite_existing_files() {
        let tmp = TempDir::new().unwrap();
        let data_dir = tmp.path().to_path_buf();

        // First init — creates defaults
        let claude_dir = init_claude_config_in(data_dir.clone()).unwrap();

        // Overwrite CLAUDE.md with custom content
        let custom = "# Custom config — do not overwrite";
        std::fs::write(claude_dir.join("CLAUDE.md"), custom).unwrap();

        // Second init — should NOT overwrite
        let claude_dir2 = init_claude_config_in(data_dir).unwrap();
        assert_eq!(claude_dir, claude_dir2);

        let content = std::fs::read_to_string(claude_dir.join("CLAUDE.md")).unwrap();
        assert_eq!(content, custom, "Second init must preserve user edits");
    }

    #[test]
    fn returns_correct_claude_dir_path() {
        let tmp = TempDir::new().unwrap();
        let data_dir = tmp.path().to_path_buf();
        let claude_dir = init_claude_config_in(data_dir.clone()).unwrap();
        assert_eq!(claude_dir, data_dir.join(".claude"));
    }

    #[test]
    fn canary_skill_file_persists_across_init() {
        let tmp = TempDir::new().unwrap();
        let data_dir = tmp.path().to_path_buf();

        // First init
        let claude_dir = init_claude_config_in(data_dir.clone()).unwrap();

        // Simulate a user (or the app) adding a custom skill file
        let commands_dir = claude_dir.join("commands");
        std::fs::create_dir_all(&commands_dir).unwrap();
        let canary = commands_dir.join("__test_canary_skill.md");
        std::fs::write(&canary, "# Canary Skill\nThis is a test skill.").unwrap();

        // Second init — skill file must survive
        let _ = init_claude_config_in(data_dir).unwrap();
        assert!(
            canary.is_file(),
            "Canary skill file should survive re-init"
        );
        let content = std::fs::read_to_string(&canary).unwrap();
        assert!(content.contains("Canary Skill"));
    }
}
