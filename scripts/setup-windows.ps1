$ErrorActionPreference = "Stop"

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repo

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 22 or newer is required. Install it from https://nodejs.org/ and rerun this script."
}

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm was not found. Install Node.js 22 or newer from https://nodejs.org/ and rerun this script."
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "Git was not found. Setup can continue, but cloning/updating the repo will require Git."
}

$nodeMajor = [int]((node --version).TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 22) {
  throw "Node.js 22 or newer is required. Current version: $(node --version)"
}

Write-Host "Installing dependencies..."
npm install

Write-Host "Building Focus Ledger..."
npm run build

Write-Host "Creating Desktop shortcut..."
powershell -ExecutionPolicy Bypass -File (Join-Path $repo "scripts\create-desktop-shortcut.ps1")

$mcpArgs = "cd /d `"$repo`" && npm run mcp --silent"

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
  codex mcp add focus-ledger -- cmd.exe /c $mcpArgs
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
  claude mcp add focus-ledger -- cmd.exe /c $mcpArgs
}

Ensure-CodexMcp
Ensure-ClaudeMcp

Write-Host ""
Write-Host "Focus Ledger is installed."
Write-Host "Open it from the Desktop shortcut, or run: npm run electron"
