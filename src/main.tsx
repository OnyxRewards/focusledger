import React, { FormEvent, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "./api";
import {
  Archive,
  Check,
  Circle,
  Clock3,
  Focus,
  Inbox,
  ListChecks,
  Plus,
  RefreshCcw,
  Sparkles,
  Zap
} from "lucide-react";
import "./styles.css";

type Project = {
  id: string;
  name: string;
  path?: string | null;
  repo_remote?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type Task = {
  id: string;
  project_id?: string | null;
  project_name?: string | null;
  title: string;
  description?: string | null;
  status: "inbox" | "next" | "doing" | "blocked" | "done" | "archived";
  priority: number;
  due_at?: string | null;
  source: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
};

type AuditEntry = {
  id: number;
  entity_type: string;
  entity_id: string;
  action: string;
  actor: string;
  before_json?: string | null;
  after_json?: string | null;
  created_at: string;
};

type Snapshot = {
  active_project_id?: string | null;
  active_task_id?: string | null;
  projects: Project[];
  tasks: Task[];
  audit: AuditEntry[];
  db_path: string;
};

const emptySnapshot: Snapshot = {
  projects: [],
  tasks: [],
  audit: [],
  db_path: ""
};

function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot);
  const [capture, setCapture] = useState("");
  const [projectName, setProjectName] = useState("");
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const data = await invoke<Snapshot>("get_snapshot");
    setSnapshot(data);
    setSelectedProject((current) => current || data.active_project_id || data.projects[0]?.id || "");
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  const activeProject = useMemo(() => {
    return snapshot.projects.find((project) => project.id === snapshot.active_project_id) ?? snapshot.projects[0];
  }, [snapshot]);

  const activeProjectId = activeProject?.id ?? (selectedProject || undefined);
  const activeProjectTasks = snapshot.tasks.filter((task) => task.project_id === activeProjectId);
  const nextActions = activeProjectTasks.filter((task) => task.status === "doing" || task.status === "next").slice(0, 5);
  const overflowCount = activeProjectTasks.filter((task) => task.status === "doing" || task.status === "next").length - nextActions.length;
  const inbox = snapshot.tasks.filter((task) => task.status === "inbox");
  const done = snapshot.tasks.filter((task) => task.status === "done").slice(0, 8);
  const agentTouched = snapshot.audit.filter((entry) => entry.actor !== "user").length;

  async function createQuickTask(event: FormEvent) {
    event.preventDefault();
    const title = capture.trim();
    if (!title) return;
    await invoke("create_task", {
      input: {
        title,
        project_id: activeProjectId ?? null,
        status: activeProjectId ? "next" : "inbox",
        priority: 2,
        source: "quick-capture",
        created_by: "user"
      }
    });
    setCapture("");
    await refresh();
  }

  async function createProject(event: FormEvent) {
    event.preventDefault();
    const name = projectName.trim();
    if (!name) return;
    const project = await invoke<Project>("create_project", { input: { name } });
    setProjectName("");
    setSelectedProject(project.id);
    await invoke("set_focus", { projectId: project.id, taskId: null });
    await refresh();
  }

  async function updateTask(id: string, status: Task["status"]) {
    await invoke("update_task", { input: { id, status } });
    await refresh();
  }

  async function setFocus(projectId: string, taskId?: string) {
    await invoke("set_focus", { projectId, taskId: taskId ?? null });
    await refresh();
  }

  if (loading) {
    return <div className="boot">Opening Focus Ledger</div>;
  }

  return (
    <main className="shell">
      <aside className="rail">
        <div className="brand">
          <div className="brand-mark">
            <Focus size={22} />
          </div>
          <div>
            <strong>Focus Ledger</strong>
            <span>local task memory</span>
          </div>
        </div>

        <form className="project-form" onSubmit={createProject}>
          <input
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder="New project"
            aria-label="New project"
          />
          <button title="Create project" type="submit">
            <Plus size={18} />
          </button>
        </form>

        <nav className="project-list" aria-label="Projects">
          {snapshot.projects.length === 0 ? (
            <p className="muted">Create a project or let an agent attach one from a Git folder.</p>
          ) : (
            snapshot.projects.map((project) => (
              <button
                className={project.id === activeProject?.id ? "project-item active" : "project-item"}
                key={project.id}
                onClick={() => setFocus(project.id)}
              >
                <span>{project.name}</span>
                <small>{snapshot.tasks.filter((task) => task.project_id === project.id && task.status !== "done").length}</small>
              </button>
            ))
          )}
        </nav>

        <div className="db-note">
          <Archive size={15} />
          <span>{snapshot.db_path}</span>
        </div>
      </aside>

      <section className="workspace">
        {error ? <div className="error">{error}</div> : null}

        <header className="topbar">
          <div>
            <p className="eyebrow">Today</p>
            <h1>{activeProject?.name ?? "Choose one project"}</h1>
          </div>
          <button className="ghost" onClick={() => refresh()} title="Refresh">
            <RefreshCcw size={18} />
          </button>
        </header>

        <form className="capture" onSubmit={createQuickTask}>
          <Zap size={20} />
          <input
            autoFocus
            value={capture}
            onChange={(event) => setCapture(event.target.value)}
            placeholder={activeProject ? `Add next action for ${activeProject.name}` : "Capture a task"}
          />
          <button type="submit">Add</button>
        </form>

        <section className="metrics" aria-label="Focus health">
          <Metric icon={<ListChecks size={18} />} label="Next actions" value={nextActions.length} />
          <Metric icon={<Inbox size={18} />} label="Inbox" value={inbox.length} />
          <Metric icon={<Check size={18} />} label="Done" value={done.length} />
          <Metric icon={<Sparkles size={18} />} label="Agent writes" value={agentTouched} />
        </section>

        {overflowCount > 0 ? (
          <div className="nudge">
            <Clock3 size={18} />
            <span>{overflowCount} extra active task{overflowCount === 1 ? "" : "s"} hidden. Trim today to five or fewer.</span>
          </div>
        ) : null}

        <section className="columns">
          <div className="panel focus-panel">
            <div className="panel-title">
              <h2>Next Actions</h2>
              <span>keep this short</span>
            </div>
            <TaskList tasks={nextActions} empty="No next actions yet." onStatus={updateTask} primary />
          </div>

          <div className="panel">
            <div className="panel-title">
              <h2>Inbox</h2>
              <span>sort later</span>
            </div>
            <TaskList tasks={inbox.slice(0, 6)} empty="Inbox is clear." onStatus={updateTask} />
          </div>
        </section>

        <section className="lower">
          <div className="panel">
            <div className="panel-title">
              <h2>Recently Done</h2>
              <span>proof of progress</span>
            </div>
            <TaskList tasks={done} empty="Nothing completed yet." onStatus={updateTask} done />
          </div>

          <div className="panel audit">
            <div className="panel-title">
              <h2>Audit</h2>
              <span>agent changes are visible</span>
            </div>
            {snapshot.audit.length === 0 ? (
              <p className="muted">No changes recorded yet.</p>
            ) : (
              snapshot.audit.slice(0, 10).map((entry) => (
                <div className="audit-row" key={entry.id}>
                  <strong>{entry.action}</strong>
                  <span>{entry.entity_type}</span>
                  <small>{entry.actor} · {new Date(entry.created_at).toLocaleString()}</small>
                </div>
              ))
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="metric">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function TaskList({
  tasks,
  empty,
  onStatus,
  primary,
  done
}: {
  tasks: Task[];
  empty: string;
  onStatus: (id: string, status: Task["status"]) => Promise<void>;
  primary?: boolean;
  done?: boolean;
}) {
  if (tasks.length === 0) {
    return <p className="muted">{empty}</p>;
  }

  return (
    <div className="task-list">
      {tasks.map((task) => (
        <article className={primary ? "task primary" : "task"} key={task.id}>
          <button
            title={done ? "Move back to next" : "Mark done"}
            onClick={() => onStatus(task.id, done ? "next" : "done")}
          >
            {done ? <Check size={18} /> : <Circle size={18} />}
          </button>
          <div>
            <h3>{task.title}</h3>
            {task.description ? <p>{task.description}</p> : null}
            <small>
              {task.project_name ?? "No project"} · {task.source}
            </small>
          </div>
          {!done && task.status !== "next" ? (
            <button className="mini" onClick={() => onStatus(task.id, "next")}>Next</button>
          ) : null}
        </article>
      ))}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
