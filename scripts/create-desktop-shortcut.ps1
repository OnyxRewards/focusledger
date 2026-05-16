$ErrorActionPreference = "Stop"

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$electronExe = Join-Path $repo "node_modules\electron\dist\electron.exe"
$appMain = Join-Path $repo "electron\main.cjs"
$distIndex = Join-Path $repo "dist\index.html"
$assetsDir = Join-Path $repo "assets"
$iconPath = Join-Path $assetsDir "focus-ledger.ico"
$desktopTargets = @([Environment]::GetFolderPath("Desktop"), (Join-Path $env:USERPROFILE "Desktop")) |
  Where-Object { $_ -and (Test-Path $_) } |
  Select-Object -Unique

if (-not (Test-Path $electronExe)) {
  throw "Electron runtime not found at $electronExe. Run npm install first."
}

if (-not (Test-Path $appMain)) {
  throw "App entrypoint not found at $appMain."
}

if (-not (Test-Path $distIndex)) {
  throw "Built app not found at $distIndex. Run npm run build first."
}

New-Item -ItemType Directory -Force $assetsDir | Out-Null

Add-Type -AssemblyName System.Drawing

$size = 256
$bitmap = [System.Drawing.Bitmap]::new($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

$bg = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(24, 35, 31))
$accent = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(159, 232, 112))
$warm = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(245, 197, 66), 14)
$grid = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(52, 75, 66), 4)

$graphics.FillRectangle($bg, 20, 20, 216, 216)
$graphics.DrawRectangle($warm, 20, 20, 216, 216)
for ($i = 74; $i -le 182; $i += 54) {
  $graphics.DrawLine($grid, 52, $i, 204, $i)
}
$graphics.FillEllipse($accent, 66, 70, 124, 124)
$graphics.FillRectangle($bg, 122, 58, 14, 148)
$graphics.FillRectangle($bg, 72, 120, 116, 14)

$pngStream = [System.IO.MemoryStream]::new()
$bitmap.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $pngStream.ToArray()

$file = [System.IO.File]::Open($iconPath, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
$writer = [System.IO.BinaryWriter]::new($file)
$writer.Write([UInt16]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]1)
$writer.Write([Byte]0)
$writer.Write([Byte]0)
$writer.Write([Byte]0)
$writer.Write([Byte]0)
$writer.Write([UInt16]1)
$writer.Write([UInt16]32)
$writer.Write([UInt32]$pngBytes.Length)
$writer.Write([UInt32]22)
$writer.Write($pngBytes)
$writer.Close()
$file.Close()

$graphics.Dispose()
$bitmap.Dispose()
$bg.Dispose()
$accent.Dispose()
$warm.Dispose()
$grid.Dispose()
$pngStream.Dispose()

$shell = New-Object -ComObject WScript.Shell
$created = @()
foreach ($desktop in $desktopTargets) {
  $shortcutPath = Join-Path $desktop "Focus Ledger.lnk"
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $electronExe
  $shortcut.Arguments = "`"$appMain`""
  $shortcut.WorkingDirectory = $repo
  $shortcut.IconLocation = "$iconPath,0"
  $shortcut.Description = "Open Focus Ledger"
  $shortcut.Save()
  $created += $shortcutPath
}

Write-Host "Created shortcuts:"
$created | ForEach-Object { Write-Host " - $_" }
Write-Host "Icon $iconPath"
