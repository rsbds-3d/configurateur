$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $PSScriptRoot 'Program.cs'
$output = Join-Path $projectRoot 'Configurateur de Bijoux Rosebuds.exe'
$icon = Join-Path $projectRoot 'assets\icons\diamond-launcher.ico'
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'

foreach ($requiredFile in @($source, $icon, $compiler)) {
  if (-not (Test-Path -LiteralPath $requiredFile)) {
    throw "Fichier requis introuvable : $requiredFile"
  }
}

$arguments = @(
  '/nologo',
  '/target:winexe',
  '/platform:anycpu',
  '/optimize+',
  "/out:$output",
  "/win32icon:$icon",
  '/reference:System.dll',
  '/reference:System.Core.dll',
  '/reference:System.Windows.Forms.dll',
  $source
)

& $compiler @arguments
if ($LASTEXITCODE -ne 0) {
  throw "La compilation du lanceur a echoue avec le code $LASTEXITCODE."
}

$file = Get-Item -LiteralPath $output
$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $output
Write-Host "Lanceur compile : $($file.FullName)"
Write-Host "Taille : $($file.Length) octets"
Write-Host "SHA-256 : $($hash.Hash)"
