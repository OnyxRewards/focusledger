import { createTask, listToday, openDb, recentAudit, upsertProjectFromCwd } from "../mcp/db.js";

const db = openDb();
const project = upsertProjectFromCwd(db, process.cwd(), "smoke-test");
const task = createTask(
  db,
  {
    title: "Smoke test next action",
    project_id: project.id,
    status: "next",
    source: "test",
    created_by: "smoke-test"
  },
  "smoke-test"
);

console.log(
  JSON.stringify(
    {
      project,
      task,
      todayCount: listToday(db).tasks.length,
      auditCount: recentAudit(db, 5).length
    },
    null,
    2
  )
);
