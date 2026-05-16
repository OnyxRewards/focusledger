import Database from "better-sqlite3";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export type TaskStatus = "inbox" | "next" | "doing" | "blocked" | "done" | "archived";

export type Task = {
  id: string;
  project_id: string | null;
  project_name?: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: number;
  due_at: string | null;
  source: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type Project = {
  id: string;
  name: string;
  path: string | null;
  repo_remote: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export function defaultDbPath() {
  const appData = process.env.APPDATA;
  if (!appData) {
    throw new Error("APPDATA is not set; Focus Ledger currently expects Windows app data storage.");
  }
  const dir = join(appData, "FocusLedger");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, "focus-ledger.sqlite3");
}

export function openDb(path = defaultDbPath()) {
  const db = new Database(path);
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
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
      source TEXT NOT NULL DEFAULT 'agent',
      created_by TEXT NOT NULL DEFAULT 'agent:mcp',
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
  `);
}

export function now() {
  return new Date().toISOString();
}

export function audit(
  db: Database.Database,
  entityType: string,
  entityId: string,
  action: string,
  actor: string,
  beforeJson?: unknown,
  afterJson?: unknown
) {
  db.prepare(`
    INSERT INTO audit_log (entity_type, entity_id, action, actor, before_json, after_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    entityType,
    entityId,
    action,
    actor,
    beforeJson == null ? null : JSON.stringify(beforeJson),
    afterJson == null ? null : JSON.stringify(afterJson),
    now()
  );
}

export function getProject(db: Database.Database, id: string): Project | undefined {
  return db.prepare("SELECT * FROM projects WHERE id = ?").get(id) as Project | undefined;
}

export function getTask(db: Database.Database, id: string): Task | undefined {
  return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Task | undefined;
}

export function createTask(
  db: Database.Database,
  input: {
    title: string;
    description?: string | null;
    project_id?: string | null;
    status?: TaskStatus;
    priority?: number;
    due_at?: string | null;
    source?: string;
    created_by?: string;
  },
  actor = "agent:mcp"
) {
  const title = input.title.trim();
  if (!title) throw new Error("title is required");
  const stamp = now();
  const status = input.status ?? "next";
  const task = {
    id: randomUUID(),
    project_id: input.project_id ?? null,
    title,
    description: input.description ?? null,
    status,
    priority: input.priority ?? 2,
    due_at: input.due_at ?? null,
    source: input.source ?? "agent",
    created_by: input.created_by ?? actor,
    created_at: stamp,
    updated_at: stamp,
    completed_at: status === "done" ? stamp : null
  };

  db.prepare(`
    INSERT INTO tasks
      (id, project_id, title, description, status, priority, due_at, source, created_by, created_at, updated_at, completed_at)
    VALUES
      (@id, @project_id, @title, @description, @status, @priority, @due_at, @source, @created_by, @created_at, @updated_at, @completed_at)
  `).run(task);
  audit(db, "task", task.id, "create", actor, null, task);
  return getTask(db, task.id)!;
}

export function updateTask(
  db: Database.Database,
  id: string,
  patch: Partial<Pick<Task, "title" | "description" | "project_id" | "status" | "priority" | "due_at">>,
  actor = "agent:mcp"
) {
  const before = getTask(db, id);
  if (!before) throw new Error(`Task not found: ${id}`);
  const completedAt =
    patch.status === "done" && !before.completed_at
      ? now()
      : patch.status && patch.status !== "done"
        ? null
        : before.completed_at;
  const after = {
    ...before,
    ...patch,
    title: patch.title?.trim() || before.title,
    updated_at: now(),
    completed_at: completedAt
  };
  db.prepare(`
    UPDATE tasks SET
      title = @title,
      description = @description,
      project_id = @project_id,
      status = @status,
      priority = @priority,
      due_at = @due_at,
      updated_at = @updated_at,
      completed_at = @completed_at
    WHERE id = @id
  `).run(after);
  const saved = getTask(db, id)!;
  audit(db, "task", id, "update", actor, before, saved);
  return saved;
}

export function addTaskNote(db: Database.Database, taskId: string, body: string, actor = "agent:mcp") {
  const task = getTask(db, taskId);
  if (!task) throw new Error(`Task not found: ${taskId}`);
  const note = {
    id: randomUUID(),
    task_id: taskId,
    body: body.trim(),
    created_by: actor,
    created_at: now()
  };
  if (!note.body) throw new Error("note body is required");
  db.prepare(`
    INSERT INTO task_notes (id, task_id, body, created_by, created_at)
    VALUES (@id, @task_id, @body, @created_by, @created_at)
  `).run(note);
  audit(db, "task", taskId, "note", actor, null, note);
  return note;
}

export function listToday(db: Database.Database) {
  const activeProjectId = db.prepare("SELECT value FROM focus_state WHERE key = 'active_project_id'").get() as
    | { value: string }
    | undefined;
  const tasks = db.prepare(`
    SELECT t.*, p.name AS project_name
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id
    WHERE t.status IN ('doing', 'next', 'inbox', 'blocked')
      AND (? IS NULL OR t.project_id = ? OR t.status = 'inbox')
    ORDER BY CASE t.status WHEN 'doing' THEN 0 WHEN 'next' THEN 1 WHEN 'inbox' THEN 2 ELSE 3 END,
      t.priority ASC,
      t.updated_at DESC
    LIMIT 20
  `).all(activeProjectId?.value ?? null, activeProjectId?.value ?? null) as Task[];
  return {
    active_project_id: activeProjectId?.value ?? null,
    tasks
  };
}

export function listProjectTasks(db: Database.Database, projectId?: string, projectPath?: string) {
  let project: Project | undefined;
  if (projectId) project = getProject(db, projectId);
  if (!project && projectPath) {
    project = db.prepare("SELECT * FROM projects WHERE path = ?").get(resolve(projectPath)) as Project | undefined;
  }
  if (!project) throw new Error("Project not found");
  const tasks = db.prepare(`
    SELECT t.*, p.name AS project_name
    FROM tasks t
    LEFT JOIN projects p ON p.id = t.project_id
    WHERE t.project_id = ? AND t.status != 'archived'
    ORDER BY CASE t.status WHEN 'doing' THEN 0 WHEN 'next' THEN 1 WHEN 'inbox' THEN 2 WHEN 'blocked' THEN 3 WHEN 'done' THEN 4 ELSE 5 END,
      t.updated_at DESC
  `).all(project.id) as Task[];
  return { project, tasks };
}

export function upsertProjectFromCwd(db: Database.Database, cwd: string, actor = "agent:mcp") {
  const root = findGitRoot(cwd) ?? resolve(cwd);
  const remote = readGitRemote(root);
  const name = basename(root);
  const existing = db.prepare("SELECT * FROM projects WHERE path = ?").get(root) as Project | undefined;
  if (existing) {
    db.prepare("UPDATE projects SET repo_remote = COALESCE(?, repo_remote), updated_at = ? WHERE id = ?").run(remote, now(), existing.id);
    return getProject(db, existing.id)!;
  }
  const stamp = now();
  const project = {
    id: randomUUID(),
    name,
    path: root,
    repo_remote: remote,
    status: "active",
    created_at: stamp,
    updated_at: stamp
  };
  db.prepare(`
    INSERT INTO projects (id, name, path, repo_remote, status, created_at, updated_at)
    VALUES (@id, @name, @path, @repo_remote, @status, @created_at, @updated_at)
  `).run(project);
  audit(db, "project", project.id, "upsert_from_cwd", actor, null, project);
  return project;
}

export function recentAudit(db: Database.Database, limit = 20) {
  return db.prepare(`
    SELECT id, entity_type, entity_id, action, actor, before_json, after_json, created_at
    FROM audit_log
    ORDER BY id DESC
    LIMIT ?
  `).all(limit);
}

export function revertAudit(db: Database.Database, auditId: number, actor = "agent:mcp") {
  const entry = db.prepare("SELECT * FROM audit_log WHERE id = ?").get(auditId) as
    | { entity_type: string; entity_id: string; before_json: string | null; after_json: string | null }
    | undefined;
  if (!entry) throw new Error(`Audit entry not found: ${auditId}`);
  if (entry.entity_type !== "task") throw new Error("Only task audit entries can be reverted in v1");
  const before = entry.before_json ? JSON.parse(entry.before_json) as Task : null;
  const current = getTask(db, entry.entity_id);
  if (!before) {
    updateTask(db, entry.entity_id, { status: "archived" }, actor);
    return { reverted: "archived_created_task", task: getTask(db, entry.entity_id) };
  }
  db.prepare(`
    UPDATE tasks SET
      project_id = @project_id,
      title = @title,
      description = @description,
      status = @status,
      priority = @priority,
      due_at = @due_at,
      source = @source,
      created_by = @created_by,
      created_at = @created_at,
      updated_at = @updated_at,
      completed_at = @completed_at
    WHERE id = @id
  `).run(before);
  audit(db, "task", before.id, "revert", actor, current, before);
  return { reverted: "task_state", task: getTask(db, before.id) };
}

function findGitRoot(cwd: string) {
  try {
    return execFileSync("git", ["-C", cwd, "rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return null;
  }
}

function readGitRemote(root: string) {
  try {
    return execFileSync("git", ["-C", root, "remote", "get-url", "origin"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    return null;
  }
}
