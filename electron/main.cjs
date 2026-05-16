const { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, Notification, Tray } = require("electron");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const isDev = process.argv.includes("--dev");
let mainWindow;
let tray;
let db;

function dbPath() {
  return path.join(app.getPath("appData"), "FocusLedger", "focus-ledger.sqlite3");
}

function now() {
  return new Date().toISOString();
}

function openDb() {
  const file = dbPath();
  db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
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
  `);
}

function audit(entityType, entityId, action, actor, beforeJson, afterJson) {
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

function taskJson(id) {
  return db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
}

const handlers = {
  get_snapshot() {
    return {
      active_project_id: db.prepare("SELECT value FROM focus_state WHERE key = 'active_project_id'").get()?.value ?? null,
      active_task_id: db.prepare("SELECT value FROM focus_state WHERE key = 'active_task_id'").get()?.value ?? null,
      projects: db.prepare("SELECT * FROM projects ORDER BY updated_at DESC").all(),
      tasks: db.prepare(`
        SELECT t.*, p.name AS project_name
        FROM tasks t
        LEFT JOIN projects p ON p.id = t.project_id
        WHERE t.status != 'archived'
        ORDER BY CASE t.status WHEN 'doing' THEN 0 WHEN 'next' THEN 1 WHEN 'inbox' THEN 2 WHEN 'blocked' THEN 3 WHEN 'done' THEN 4 ELSE 5 END,
          t.priority ASC,
          t.updated_at DESC
      `).all(),
      audit: db.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT 40").all(),
      db_path: dbPath()
    };
  },

  create_project({ input }) {
    const stamp = now();
    const project = {
      id: randomUUID(),
      name: input.name.trim(),
      path: input.path ?? null,
      repo_remote: null,
      status: "active",
      created_at: stamp,
      updated_at: stamp
    };
    db.prepare(`
      INSERT INTO projects (id, name, path, repo_remote, status, created_at, updated_at)
      VALUES (:id, :name, :path, :repo_remote, :status, :created_at, :updated_at)
    `).run(project);
    audit("project", project.id, "create", "user", null, project);
    return project;
  },

  create_task({ input }) {
    const title = input.title.trim();
    if (!title) throw new Error("Task title is required");
    const stamp = now();
    const status = input.status ?? "inbox";
    const task = {
      id: randomUUID(),
      project_id: input.project_id ?? null,
      title,
      description: input.description ?? null,
      status,
      priority: input.priority ?? 2,
      due_at: input.due_at ?? null,
      source: input.source ?? "user",
      created_by: input.created_by ?? "user",
      created_at: stamp,
      updated_at: stamp,
      completed_at: status === "done" ? stamp : null
    };
    db.prepare(`
      INSERT INTO tasks
        (id, project_id, title, description, status, priority, due_at, source, created_by, created_at, updated_at, completed_at)
      VALUES
        (:id, :project_id, :title, :description, :status, :priority, :due_at, :source, :created_by, :created_at, :updated_at, :completed_at)
    `).run(task);
    audit("task", task.id, "create", "user", null, task);
    return taskJson(task.id);
  },

  update_task({ input }) {
    const before = taskJson(input.id);
    if (!before) throw new Error("Task not found");
    const completedAt =
      input.status === "done" && !before.completed_at
        ? now()
        : input.status && input.status !== "done"
          ? null
          : before.completed_at;
    const after = {
      ...before,
      ...input,
      title: input.title?.trim() || before.title,
      description: input.description ?? before.description,
      project_id: input.project_id ?? before.project_id,
      status: input.status ?? before.status,
      priority: input.priority ?? before.priority,
      due_at: input.due_at ?? before.due_at,
      updated_at: now(),
      completed_at: completedAt
    };
    db.prepare(`
      UPDATE tasks SET
        project_id = :project_id,
        title = :title,
        description = :description,
        status = :status,
        priority = :priority,
        due_at = :due_at,
        updated_at = :updated_at,
        completed_at = :completed_at
      WHERE id = :id
    `).run(after);
    audit("task", input.id, "update", "user", before, taskJson(input.id));
  },

  set_focus({ projectId, taskId }) {
    db.prepare("DELETE FROM focus_state WHERE key IN ('active_project_id', 'active_task_id')").run();
    if (projectId) db.prepare("INSERT INTO focus_state (key, value) VALUES ('active_project_id', ?)").run(projectId);
    if (taskId) db.prepare("INSERT INTO focus_state (key, value) VALUES ('active_task_id', ?)").run(taskId);
    audit("focus", "today", "set", "user", null, { projectId, taskId });
  }
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 980,
    minHeight: 680,
    title: "Focus Ledger",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.webContents.on("console-message", (_event, _level, message, line, sourceId) => {
    console.log(`[renderer] ${sourceId}:${line} ${message}`);
  });
  mainWindow.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error(`[renderer-load-failed] ${code} ${description} ${url}`);
  });
  if (isDev) {
    mainWindow.loadURL("http://127.0.0.1:1420");
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

function createTray() {
  const icon = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAGUlEQVR4AWNkYGD4z0ABYBw1gGE0DBQAAEwDEBExw9GzAAAAAElFTkSuQmCC"
  );
  tray = new Tray(icon);
  tray.setToolTip("Focus Ledger");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Show Focus Ledger", click: () => mainWindow?.show() },
      {
        label: "Gentle nudge",
        click: () => new Notification({ title: "Focus Ledger", body: "Pick one next action and finish that first." }).show()
      },
      { type: "separator" },
      { label: "Quit", click: () => app.quit() }
    ])
  );
}

app.whenReady().then(() => {
  openDb();
  ipcMain.handle("focus-ledger:invoke", (_event, command, args) => {
    const handler = handlers[command];
    if (!handler) throw new Error(`Unknown command: ${command}`);
    return handler(args || {});
  });
  createWindow();
  createTray();
  globalShortcut.register("CommandOrControl+Shift+Space", () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
});

app.on("window-all-closed", (event) => {
  event.preventDefault();
  mainWindow?.hide();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  db?.close();
});
