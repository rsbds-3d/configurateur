$ErrorActionPreference = 'Stop'

$installRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$targetExe = Join-Path $installRoot 'Configurateur de Bijoux Rosebuds.exe'
$iconPath = Join-Path $installRoot 'assets\icons\diamond-launcher.ico'

if (-not (Test-Path -LiteralPath $targetExe)) {
  throw "Application introuvable: $targetExe"
}

if (-not (Test-Path -LiteralPath $iconPath)) {
  throw "Icone introuvable: $iconPath"
}

$shell = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$programs = [Environment]::GetFolderPath('Programs')
$startMenuFolder = Join-Path $programs 'Configurateur de Bijoux'
New-Item -ItemType Directory -Force -Path $startMenuFolder | Out-Null

$shortcuts = @(
  (Join-Path $desktop 'Configurateur de Bijoux.lnk'),
  (Join-Path $startMenuFolder 'Configurateur de Bijoux.lnk')
)

foreach ($shortcutPath in $shortcuts) {
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $targetExe
  $shortcut.WorkingDirectory = $installRoot
  $shortcut.IconLocation = "$targetExe,0"
  $shortcut.WindowStyle = 7
  $shortcut.Description = 'Lancer le configurateur de bijoux'
  $shortcut.Save()
}

Write-Host "Raccourci Bureau: $($shortcuts[0])"
Write-Host "Raccourci menu Demarrer: $($shortcuts[1])"
Write-Host "Installation du configurateur terminee."
