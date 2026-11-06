# Creates a "BTTW Data Tool" shortcut on the desktop that opens the tool directly
# (no terminal, no npm start). Run with: npm run shortcut
$root = Split-Path -Parent $PSScriptRoot
$electron = Join-Path $root 'node_modules\electron\dist\electron.exe'
if (-not (Test-Path $electron)) {
    # npm install sometimes skips Electron's own download step; run it directly.
    Write-Host "Downloading Electron..."
    Push-Location $root
    node node_modules\electron\install.js
    Pop-Location
}
if (-not (Test-Path $electron)) {
    Write-Error "Electron is still missing at $electron. Run 'npm install' in $root, then try again."
    exit 1
}
$desktop = [Environment]::GetFolderPath('Desktop')
$shell = New-Object -ComObject WScript.Shell
$link = $shell.CreateShortcut((Join-Path $desktop 'BTTW Data Tool.lnk'))
$link.TargetPath = $electron
$link.Arguments = '"' + $root + '"'
$link.WorkingDirectory = $root
$link.Description = 'Balls to the Walls data tool'
$link.Save()
Write-Host "Created 'BTTW Data Tool' on your desktop."
