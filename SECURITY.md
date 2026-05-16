# Security

Focus Ledger stores data locally in SQLite and exposes a local MCP server for coding agents.

## Reporting

Please open a private security advisory on GitHub if the repository supports it. If not, open an issue with minimal reproduction details and avoid posting secrets, tokens, or private task data.

## Local Data

The default Windows database path is:

```text
%APPDATA%\FocusLedger\focus-ledger.sqlite3
```

Do not commit this database file. It may contain private project names, task notes, and agent audit history.
