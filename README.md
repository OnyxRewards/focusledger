# Focus Ledger

Focus Ledger is a local-first desktop task tracker for people who build with AI coding agents.

It gives you a small, visible task surface outside the chat window, and gives agents an MCP interface so they can add tasks, mark work complete, leave notes, and keep project context alive between sessions.

## What Problem It Solves

AI coding tools are good at making plans, but those plans often get trapped in a single conversation. If you use Codex, Claude Code, or other MCP-capable agents, it is easy to end up with:

- half-finished project plans scattered across chats
- agents forgetting what they already did
- no stable checklist across tools
- too many active ideas and no clear next action

Focus Ledger acts as a shared local task ledger. You use the desktop app to stay focused; agents use MCP tools to keep the ledger updated while they work.

## Who It Is For

- People who “vibe code” with AI agents across multiple projects.
- People who start many projects and need one visible Today view.
- Developers who want agent-written task updates without adopting a full project management SaaS.
- Anyone who wants local task data instead of cloud storage.

## Core Ideas

- **Local-first:** your task database stays on your machine.
- **Today focus:** the UI is designed around one active project and a short list of next actions.
- **Agent writable:** MCP tools let agents update the same task list you see.
- **Auditable:** agent and user changes are recorded in an audit log.
- **Project aware:** agents can attach tasks to the current Git/project folder.

## Features

- Windows desktop app powered by Electron.
- Today view with active project, next actions, inbox, recently done tasks, and audit history.
- Quick task capture.
- Desktop shortcut and tray entry.
- Shared SQLite database.
- MCP server for Codex, Claude Code, and other MCP clients.
- Agent tools for creating, updating, completing, listing, and reverting task changes.
- Auto-linking from agent working directory to project records.

## How It Works

Focus Ledger has three pieces:

1. **Desktop app**
   - Shows your current project, inbox, next actions, recently completed tasks, and audit log.
   - Reads and writes to a local SQLite database.

2. **SQLite database**
   - Stored locally at `%APPDATA%\FocusLedger\focus-ledger.sqlite3`.
   - Shared by the desktop app and MCP server.

3. **MCP server**
   - Runs locally with `npm run mcp`.
   - Exposes task/project tools to AI coding agents.
   - Lets agents update the same local database the desktop app uses.

## Quick Start on Windows

### Requirements

- Windows 10 or 11
- Node.js 22 or newer
- Git
- Optional: Codex CLI and/or Claude Code CLI

Check your versions:

```powershell
node --version
git --version
```

### Install

```powershell
git clone https://github.com/OnyxRewards/focusledger.git
cd focusledger
npm run setup:windows
```

The setup script will:

- install npm dependencies
- build the desktop app
- create a `Focus Ledger` desktop shortcut
- register the MCP server with Codex if the Codex CLI is installed
- register the MCP server with Claude Code if the Claude CLI is installed

After setup, open **Focus Ledger** from your desktop.

## Manual Run

If you do not want to use the setup script:

```powershell
npm install
npm run build
npm run electron
```

For development mode:

```powershell
npm run electron:dev
```

## MCP Setup

The setup script attempts to register the MCP server automatically. If you want to register it manually, run the relevant command from inside the cloned repo.

### Codex

```powershell
$repo = (Get-Location).Path
codex mcp add focus-ledger -- cmd.exe /c "cd /d `"$repo`" && npm run mcp --silent"
```

Verify:

```powershell
codex mcp list
```

### Claude Code

```powershell
$repo = (Get-Location).Path
claude mcp add focus-ledger -- cmd.exe /c "cd /d `"$repo`" && npm run mcp --silent"
```

Verify:

```powershell
claude mcp get focus-ledger
```

## MCP Tools

Focus Ledger exposes these tools:

- `project_upsert_from_cwd`: create or find a project using the agent's current working directory.
- `task_create`: create a task, usually as a concrete next action.
- `task_update`: update title, description, project, status, priority, or due date.
- `task_complete`: mark a task done and optionally add a completion note.
- `task_add_note`: append progress or handoff notes to a task.
- `task_list_today`: list the active project, inbox, next actions, and blocked work.
- `task_list_project`: list tasks for a specific project.
- `audit_recent`: inspect recent user/agent changes.
- `audit_revert`: revert a task audit entry.

## Example Agent Prompts

Once the MCP server is connected, you can ask an agent:

```text
Use Focus Ledger to create next actions for this repo before you start coding.
```

```text
Check Focus Ledger for today's tasks, pick the highest priority one for this project, and work on it.
```

```text
When you finish each implementation step, mark the related Focus Ledger task done and add a note with what changed.
```

```text
Before ending this session, add any remaining follow-up tasks to Focus Ledger.
```

## Task Statuses

Focus Ledger currently uses these task states:

- `inbox`: captured but not sorted
- `next`: ready to do
- `doing`: actively being worked
- `blocked`: waiting on something
- `done`: completed
- `archived`: hidden from normal views

## Data and Privacy

Focus Ledger does not require an account and does not sync to a cloud service.

Local data lives here:

```text
%APPDATA%\FocusLedger\focus-ledger.sqlite3
```

That database may contain private project names, notes, and agent audit history. Do not commit it to Git. The repository ignores common SQLite database file extensions by default.

## Troubleshooting

### The app opens as a blank white window

Run:

```powershell
npm run build
npm run electron
```

If you are developing, make sure `vite.config.ts` keeps `base: "./"` so Electron can load built assets from `file://`.

### MCP is not available in Codex or Claude

Check that the server is registered:

```powershell
codex mcp list
claude mcp get focus-ledger
```

If registration is missing, rerun:

```powershell
npm run setup:windows
```

### The desktop shortcut is missing

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\create-desktop-shortcut.ps1
```

### `npm install` fails on SQLite

Make sure you are using Node.js 22 or newer. If native dependency installation still fails, delete `node_modules` and reinstall:

```powershell
Remove-Item -Recurse -Force node_modules
npm install
```

## Development

Run checks:

```powershell
npm run build
npm run mcp:smoke
npm audit --omit=dev
```

Project layout:

```text
electron/      Electron desktop shell
mcp/           MCP server and SQLite data access
scripts/       Windows setup, shortcut creation, smoke tests
src/           React app
src-tauri/     Experimental Tauri runtime
```

## Current Limitations

- Windows is the primary supported platform.
- There is not yet a packaged installer; users currently clone the repo and run the setup script.
- The app uses Electron as the working runtime.
- A Tauri implementation exists, but building it on Windows requires Visual Studio Build Tools with the C++ workload so Rust can find `link.exe`.
- There is no cloud sync or mobile app.

## Roadmap Ideas

- Packaged Windows installer.
- Import/export tasks.
- Better task filtering and search.
- Global quick-capture overlay.
- More MCP clients documented.
- Optional packaged MCP server binary.

## Contributing

Contributions are welcome. Please keep the project local-first, agent-friendly, and focused on reducing task overload rather than becoming a full project management suite.

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
