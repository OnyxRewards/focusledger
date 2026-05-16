#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use uuid::Uuid;

#[derive(Debug, Serialize)]
struct Project {
    id: String,
    name: String,
    path: Option<String>,
    repo_remote: Option<String>,
    status: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
struct Task {
    id: String,
    project_id: Option<String>,
    project_name: Option<String>,
    title: String,
    description: Option<String>,
    status: String,
    priority: i64,
    due_at: Option<String>,
    source: String,
    created_by: String,
    created_at: String,
    updated_at: String,
    completed_at: Option<String>,
}

#[derive(Debug, Serialize)]
struct AuditEntry {
    id: i64,
    entity_type: String,
    entity_id: String,
    action: String,
    actor: String,
    before_json: Option<String>,
    after_json: Option<String>,
    created_at: String,
}

#[derive(Debug, Serialize)]
struct AppSnapshot {
    active_project_id: Option<String>,
    active_task_id: Option<String>,
    projects: Vec<Project>,
    tasks: Vec<Task>,
    audit: Vec<AuditEntry>,
    db_path: String,
}

#[derive(Debug, Deserialize)]
struct CreateTaskInput {
    title: String,
    description: Option<String>,
    project_id: Option<String>,
    status: Option<String>,
    priority: Option<i64>,
    due_at: Option<String>,
    source: Option<String>,
    created_by: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CreateProjectInput {
    name: String,
    path: Option<String>,
}

#[derive(Debug, Deserialize)]
struct UpdateTaskInput {
    id: String,
    title: Option<String>,
    description: Option<String>,
    project_id: Option<String>,
    status: Option<String>,
    priority: Option<i64>,
    due_at: Option<String>,
}

struct AppState {
    db: Mutex<Connection>,
    db_path: String,
}

fn app_data_dir() -> Result<PathBuf, String> {
    let appdata = std::env::var("APPDATA").map_err(|_| "APPDATA is not set".to_string())?;
    Ok(PathBuf::from(appdata).join("FocusLedger"))
}

fn open_database() -> Result<(Connection, String), String> {
    let dir = app_data_dir()?;
    fs::create_dir_all(&dir).map_err(|e| format!("Could not create app data dir: {e}"))?;
    let path = dir.join("focus-ledger.sqlite3");
    let conn = Connection::open(&path).map_err(|e| format!("Could not open database: {e}"))?;
    migrate(&conn)?;
    Ok((conn, path.to_string_lossy().to_string()))
}

fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            path TEXT UNIQUE,
            repo_remote TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
            title TEXT NOT NULL,
            description TEXT,
            status TEXT NOT NULL DEFAULT 'inbox',
            priority INTEGER NOT NULL DEFAULT 2,
            due_at TEXT,
            source TEXT NOT NULL DEFAULT 'user',
            created_by TEXT NOT NULL DEFAULT 'user',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            completed_at TEXT
        );
        CREATE TABLE IF NOT EXISTS task_notes (
            id TEXT PRIMARY KEY,
            task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
            body TEXT NOT NULL,
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS focus_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            action TEXT NOT NULL,
            actor TEXT NOT NULL,
            before_json TEXT,
            after_json TEXT,
            created_at TEXT NOT NULL
        );
        ",
    )
    .map_err(|e| format!("Migration failed: {e}"))?;
    Ok(())
}

fn now() -> String {
    Utc::now().to_rfc3339()
}

fn audit(
    conn: &Connection,
    entity_type: &str,
    entity_id: &str,
    action: &str,
    actor: &str,
    before_json: Option<String>,
    after_json: Option<String>,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO audit_log (entity_type, entity_id, action, actor, before_json, after_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![entity_type, entity_id, action, actor, before_json, after_json, now()],
    )
    .map_err(|e| format!("Audit failed: {e}"))?;
    Ok(())
}

fn get_task_json(conn: &Connection, id: &str) -> Result<Option<String>, String> {
    conn.query_row(
        "SELECT json_object(
            'id', id, 'project_id', project_id, 'title', title, 'description', description,
            'status', status, 'priority', priority, 'due_at', due_at, 'source', source,
            'created_by', created_by, 'created_at', created_at, 'updated_at', updated_at,
            'completed_at', completed_at
        ) FROM tasks WHERE id = ?1",
        params![id],
        |row| row.get(0),
    )
    .optional()
    .map_err(|e| format!("Could not load task JSON: {e}"))
}

fn list_projects(conn: &Connection) -> Result<Vec<Project>, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, path, repo_remote, status, created_at, updated_at FROM projects ORDER BY updated_at DESC")
        .map_err(|e| format!("Could not prepare projects query: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                repo_remote: row.get(3)?,
                status: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })
        .map_err(|e| format!("Could not query projects: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Could not read projects: {e}"))
}

fn list_tasks(conn: &Connection) -> Result<Vec<Task>, String> {
    let mut stmt = conn
        .prepare(
            "
            SELECT t.id, t.project_id, p.name, t.title, t.description, t.status, t.priority, t.due_at,
                   t.source, t.created_by, t.created_at, t.updated_at, t.completed_at
            FROM tasks t
            LEFT JOIN projects p ON p.id = t.project_id
            WHERE t.status != 'archived'
            ORDER BY
                CASE t.status WHEN 'doing' THEN 0 WHEN 'next' THEN 1 WHEN 'inbox' THEN 2 WHEN 'blocked' THEN 3 WHEN 'done' THEN 4 ELSE 5 END,
                t.priority ASC,
                t.updated_at DESC
            ",
        )
        .map_err(|e| format!("Could not prepare tasks query: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Task {
                id: row.get(0)?,
                project_id: row.get(1)?,
                project_name: row.get(2)?,
                title: row.get(3)?,
                description: row.get(4)?,
                status: row.get(5)?,
                priority: row.get(6)?,
                due_at: row.get(7)?,
                source: row.get(8)?,
                created_by: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
                completed_at: row.get(12)?,
            })
        })
        .map_err(|e| format!("Could not query tasks: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Could not read tasks: {e}"))
}

fn list_audit(conn: &Connection) -> Result<Vec<AuditEntry>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, entity_type, entity_id, action, actor, before_json, after_json, created_at
             FROM audit_log ORDER BY id DESC LIMIT 40",
        )
        .map_err(|e| format!("Could not prepare audit query: {e}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok(AuditEntry {
                id: row.get(0)?,
                entity_type: row.get(1)?,
                entity_id: row.get(2)?,
                action: row.get(3)?,
                actor: row.get(4)?,
                before_json: row.get(5)?,
                after_json: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| format!("Could not query audit: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Could not read audit: {e}"))
}

#[tauri::command]
fn get_snapshot(state: tauri::State<AppState>) -> Result<AppSnapshot, String> {
    let conn = state.db.lock().map_err(|_| "Database lock poisoned".to_string())?;
    let active_project_id = conn
        .query_row("SELECT value FROM focus_state WHERE key = 'active_project_id'", [], |r| r.get(0))
        .optional()
        .map_err(|e| format!("Could not read active project: {e}"))?;
    let active_task_id = conn
        .query_row("SELECT value FROM focus_state WHERE key = 'active_task_id'", [], |r| r.get(0))
        .optional()
        .map_err(|e| format!("Could not read active task: {e}"))?;

    Ok(AppSnapshot {
        active_project_id,
        active_task_id,
        projects: list_projects(&conn)?,
        tasks: list_tasks(&conn)?,
        audit: list_audit(&conn)?,
        db_path: state.db_path.clone(),
    })
}

#[tauri::command]
fn create_project(input: CreateProjectInput, state: tauri::State<AppState>) -> Result<Project, String> {
    let id = Uuid::new_v4().to_string();
    let stamp = now();
    let conn = state.db.lock().map_err(|_| "Database lock poisoned".to_string())?;
    conn.execute(
        "INSERT INTO projects (id, name, path, status, created_at, updated_at) VALUES (?1, ?2, ?3, 'active', ?4, ?4)",
        params![id, input.name.trim(), input.path, stamp],
    )
    .map_err(|e| format!("Could not create project: {e}"))?;
    audit(&conn, "project", &id, "create", "user", None, None)?;
    let project = list_projects(&conn)?
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| "Created project could not be loaded".to_string())?;
    Ok(project)
}

#[tauri::command]
fn create_task(input: CreateTaskInput, state: tauri::State<AppState>) -> Result<Task, String> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err("Task title is required".to_string());
    }
    let id = Uuid::new_v4().to_string();
    let stamp = now();
    let status = input.status.unwrap_or_else(|| "inbox".to_string());
    let priority = input.priority.unwrap_or(2);
    let source = input.source.unwrap_or_else(|| "user".to_string());
    let created_by = input.created_by.unwrap_or_else(|| "user".to_string());
    let completed_at = if status == "done" { Some(stamp.clone()) } else { None };
    let conn = state.db.lock().map_err(|_| "Database lock poisoned".to_string())?;
    conn.execute(
        "INSERT INTO tasks (id, project_id, title, description, status, priority, due_at, source, created_by, created_at, updated_at, completed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10, ?11)",
        params![id, input.project_id, title, input.description, status, priority, input.due_at, source, created_by, stamp, completed_at],
    )
    .map_err(|e| format!("Could not create task: {e}"))?;
    let after = get_task_json(&conn, &id)?;
    audit(&conn, "task", &id, "create", "user", None, after)?;
    list_tasks(&conn)?
        .into_iter()
        .find(|t| t.id == id)
        .ok_or_else(|| "Created task could not be loaded".to_string())
}

#[tauri::command]
fn update_task(input: UpdateTaskInput, state: tauri::State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|_| "Database lock poisoned".to_string())?;
    let before = get_task_json(&conn, &input.id)?;
    if before.is_none() {
        return Err("Task not found".to_string());
    }
    let current_completed_at: Option<String> = conn
        .query_row("SELECT completed_at FROM tasks WHERE id = ?1", params![input.id], |r| r.get(0))
        .map_err(|e| format!("Could not read task completion: {e}"))?;
    let new_completed_at = match input.status.as_deref() {
        Some("done") if current_completed_at.is_none() => Some(now()),
        Some(status) if status != "done" => None,
        _ => current_completed_at,
    };
    conn.execute(
        "
        UPDATE tasks SET
          title = COALESCE(?2, title),
          description = COALESCE(?3, description),
          project_id = COALESCE(?4, project_id),
          status = COALESCE(?5, status),
          priority = COALESCE(?6, priority),
          due_at = COALESCE(?7, due_at),
          completed_at = ?8,
          updated_at = ?9
        WHERE id = ?1
        ",
        params![
            input.id,
            input.title.map(|s| s.trim().to_string()),
            input.description,
            input.project_id,
            input.status,
            input.priority,
            input.due_at,
            new_completed_at,
            now()
        ],
    )
    .map_err(|e| format!("Could not update task: {e}"))?;
    let after = get_task_json(&conn, &input.id)?;
    audit(&conn, "task", &input.id, "update", "user", before, after)?;
    Ok(())
}

#[tauri::command]
fn set_focus(project_id: Option<String>, task_id: Option<String>, state: tauri::State<AppState>) -> Result<(), String> {
    let conn = state.db.lock().map_err(|_| "Database lock poisoned".to_string())?;
    conn.execute("DELETE FROM focus_state WHERE key IN ('active_project_id', 'active_task_id')", [])
        .map_err(|e| format!("Could not clear focus: {e}"))?;
    if let Some(value) = project_id {
        conn.execute("INSERT INTO focus_state (key, value) VALUES ('active_project_id', ?1)", params![value])
            .map_err(|e| format!("Could not save active project: {e}"))?;
    }
    if let Some(value) = task_id {
        conn.execute("INSERT INTO focus_state (key, value) VALUES ('active_task_id', ?1)", params![value])
            .map_err(|e| format!("Could not save active task: {e}"))?;
    }
    audit(&conn, "focus", "today", "set", "user", None, None)?;
    Ok(())
}

fn main() {
    let (conn, db_path) = open_database().expect("database should initialize");
    tauri::Builder::default()
        .manage(AppState {
            db: Mutex::new(conn),
            db_path,
        })
        .invoke_handler(tauri::generate_handler![
            get_snapshot,
            create_project,
            create_task,
            update_task,
            set_focus
        ])
        .run(tauri::generate_context!())
        .expect("error while running Focus Ledger");
}
