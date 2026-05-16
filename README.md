# Focus Ledger

Focus Ledger is a local-first desktop task tracker for people who build with coding agents.

It keeps one project and a small number of next actions visible, while exposing MCP tools so Codex, Claude Code, and other agent clients can create tasks, mark work done, and leave audit-tracked notes.

## Why

Coding agents are good at producing plans, but those plans often disappear into chat history. Focus Ledger gives agents a shared local task surface so work can continue across sessions without relying on memory, screenshots, or copied checklists.

## Features

- Local Windows desktop app.
- ADHD-friendly Today view: one active project, inbox, next actions, recently done, audit trail.
- Quick capture for new tasks.
- Desktop shortcut and tray entry.
- Shared SQLite database.
- MCP server for agent read/write access.
- Agent changes are auditable and reversible.
- Auto-link tasks to coding projects from the agent working directory.

## Install on Windows

Requirements:

- Node.js 22 or newer
- Git
- Optional: Codex CLI and/or Claude Code CLI for MCP registration

```powershell
git clone https://github.com/YOUR-USERNAME/focus-ledger.git
cd focus-ledger
npm run setup:windows
```

The setup script will:

- install dependencies
- build the app
- create a `Focus Ledger` Desktop shortcut
- register the `focus-ledger` MCP server with Codex and Claude if those CLIs are installed

## Run Manually

```powershell
npm install
npm run build
npm run electron
```

For live development:

```powershell
npm run electron:dev
```

## MCP Tools

The bundled MCP server exposes:

- `project_upsert_from_cwd`
- `task_create`
- `task_update`
- `task_complete`
- `task_add_note`
- `task_list_today`
- `task_list_project`
- `audit_recent`
- `audit_revert`

Run the MCP server manually:

```powershell
npm run mcp
```

Register with Codex:

```powershell
codex mcp add focus-ledger -- cmd.exe /c "cd /d %CD% && npm run mcp --silent"
```

Register with Claude Code:

```powershell
claude mcp add focus-ledger -- cmd.exe /c "cd /d %CD% && npm run mcp --silent"
```

## Data Storage

The local SQLite database is stored at:

```text
%APPDATA%\FocusLedger\focus-ledger.sqlite3
```

This file is intentionally ignored by Git.

## Development Checks

```powershell
npm run build
npm run mcp:smoke
npm audit --omit=dev
```

## Current Status

Focus Ledger currently uses Electron as the working desktop runtime. A Tauri implementation exists under `src-tauri`, but Windows Tauri builds require Visual Studio Build Tools with the C++ workload so Rust can find `link.exe`.

## License

MIT
