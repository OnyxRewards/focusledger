#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  addTaskNote,
  createTask,
  listProjectTasks,
  listToday,
  openDb,
  recentAudit,
  revertAudit,
  updateTask,
  upsertProjectFromCwd
} from "./db.js";

const db = openDb();

const server = new McpServer({
  name: "focus-ledger",
  version: "0.1.0"
});

function jsonContent(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

server.tool(
  "project_upsert_from_cwd",
  "Create or find a Focus Ledger project from the agent current working directory.",
  {
    cwd: z.string().describe("Current working directory for the coding project.")
  },
  ({ cwd }) => jsonContent(upsertProjectFromCwd(db, cwd))
);

server.tool(
  "task_create",
  "Create a concrete next action, optionally attached to a project.",
  {
    title: z.string().min(1),
    description: z.string().optional(),
    project_id: z.string().optional(),
    cwd: z.string().optional(),
    status: z.enum(["inbox", "next", "doing", "blocked", "done", "archived"]).default("next"),
    priority: z.number().int().min(1).max(5).default(2),
    due_at: z.string().optional()
  },
  ({ title, description, project_id, cwd, status, priority, due_at }) => {
    const project = project_id ? undefined : cwd ? upsertProjectFromCwd(db, cwd) : undefined;
    return jsonContent(
      createTask(db, {
        title,
        description,
        project_id: project_id ?? project?.id ?? null,
        status,
        priority,
        due_at,
        source: "agent"
      })
    );
  }
);

server.tool(
  "task_update",
  "Update task fields such as title, description, status, priority, project, or due date.",
  {
    id: z.string(),
    title: z.string().optional(),
    description: z.string().nullable().optional(),
    project_id: z.string().nullable().optional(),
    status: z.enum(["inbox", "next", "doing", "blocked", "done", "archived"]).optional(),
    priority: z.number().int().min(1).max(5).optional(),
    due_at: z.string().nullable().optional()
  },
  ({ id, ...patch }) => jsonContent(updateTask(db, id, patch))
);

server.tool(
  "task_complete",
  "Mark a task done, optionally adding a completion note first.",
  {
    id: z.string(),
    note: z.string().optional()
  },
  ({ id, note }) => {
    if (note) addTaskNote(db, id, note);
    return jsonContent(updateTask(db, id, { status: "done" }));
  }
);

server.tool(
  "task_add_note",
  "Append progress, decisions, or handoff context to a task.",
  {
    task_id: z.string(),
    body: z.string().min(1)
  },
  ({ task_id, body }) => jsonContent(addTaskNote(db, task_id, body))
);

server.tool(
  "task_list_today",
  "List active project tasks, inbox tasks, and blocked tasks relevant to today's focus.",
  {},
  () => jsonContent(listToday(db))
);

server.tool(
  "task_list_project",
  "List all non-archived tasks for a project by id or exact project path.",
  {
    project_id: z.string().optional(),
    project_path: z.string().optional()
  },
  ({ project_id, project_path }) => jsonContent(listProjectTasks(db, project_id, project_path))
);

server.tool(
  "audit_recent",
  "Show recent task/project/focus changes, including agent writes.",
  {
    limit: z.number().int().min(1).max(100).default(20)
  },
  ({ limit }) => jsonContent(recentAudit(db, limit))
);

server.tool(
  "audit_revert",
  "Revert a task audit entry. Create entries are reverted by archiving the created task.",
  {
    audit_id: z.number().int()
  },
  ({ audit_id }) => jsonContent(revertAudit(db, audit_id))
);

await server.connect(new StdioServerTransport());
