# Contributing

Focus Ledger is built for people who are using coding agents and want tasks to stay visible outside the chat window.

## Local Development

```powershell
npm install
npm run electron:dev
```

Run checks before opening a PR:

```powershell
npm run build
npm run mcp:smoke
npm audit --omit=dev
```

## Pull Request Guidelines

- Keep the app local-first.
- Keep task flows short and ADHD-friendly.
- Avoid adding cloud accounts, analytics, or background network calls without a clear opt-in.
- Any agent-write behavior should be auditable and reversible.
- Prefer small, concrete MCP tools over broad free-form mutation tools.
