$ErrorActionPreference = "Stop"

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repo

Write-Host "Installing dependencies..."
npm install

Write-Host "Building Focus Ledger..."
npm run build

Write-Host "Creating Desktop shortcut..."
powershell -ExecutionPolicy Bypass -File (Join-Path $repo "scripts\create-desktop-shortcut.ps1")

$mcpCommand = "cmd.exe"
$mcpArgs = "/c cd /d $repo && npm run mcp --silent"

function Ensure-CodexMcp {
  if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
    Write-Host "Codex CLI not found; skipping Codex MCP registration."
    return
  }

  $list = codex mcp list 2>$null | Out-String
  if ($list -match "focus-ledger") {
    Write-Host "Codex MCP 'focus-ledger' already exists."
    return
  }

  Write-Host "Registering Codex MCP..."
  codex mcp add focus-ledger -- cmd.exe /c "cd /d $repo && npm run mcp --silent"
}

function Ensure-ClaudeMcp {
  if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Host "Claude CLI not found; skipping Claude MCP registration."
    return
  }

  $list = claude mcp list 2>$null | Out-String
  if ($list -match "focus-ledger") {
    Write-Host "Claude MCP 'focus-ledger' already exists."
    return
  }

  Write-Host "Registering Claude MCP..."
  claude mcp add focus-ledger -- cmd.exe /c "cd /d $repo && npm run mcp --silent"
}

Ensure-CodexMcp
Ensure-ClaudeMcp

Write-Host ""
Write-Host "Focus Ledger is installed."
Write-Host "Open it from the Desktop shortcut, or run: npm run electron"
