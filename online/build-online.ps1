$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$outputRoot = Join-Path $PSScriptRoot 'dist'
$expectedPrefix = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$resolvedOutput = [IO.Path]::GetFullPath($outputRoot)
$cacheToken = '20260930-login-page-v11'

if (-not $resolvedOutput.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Le dossier de sortie doit rester dans le dossier online."
}

if (Test-Path -LiteralPath $outputRoot) {
  Remove-Item -LiteralPath $outputRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $outputRoot | Out-Null

$applicationFiles = @('app.js', 'welcome.js', 'style.css', 'welcome.css')
foreach ($relativePath in $applicationFiles) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $relativePath) -Destination $outputRoot
}
Copy-Item -LiteralPath (Join-Path $projectRoot 'assets') -Destination $outputRoot -Recurse

foreach ($relativePath in @('auth.js', 'app-guard.js', 'online.css')) {
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot $relativePath) -Destination $outputRoot
}

$login = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'login.html') -Raw -Encoding UTF8
$login = $login.Replace('__CACHE_TOKEN__', $cacheToken)
[IO.File]::WriteAllText((Join-Path $outputRoot 'index.html'), $login, [Text.UTF8Encoding]::new($false))

$application = Get-Content -LiteralPath (Join-Path $projectRoot 'index.html') -Raw -Encoding UTF8
$guardMarkup = '    <script src="./app-guard.js?v=' + $cacheToken + '"></script>' + [Environment]::NewLine
$application = [regex]::Replace(
  $application,
  '(<meta charset="UTF-8"\s*/>\r?\n)',
  '$1' + $guardMarkup,
  1
)
if ($application -notmatch 'app-guard\.js') {
  throw "Le garde d'accès n'a pas pu être injecté dans configurateur.html."
}
[IO.File]::WriteAllText((Join-Path $outputRoot 'configurateur.html'), $application, [Text.UTF8Encoding]::new($false))

New-Item -ItemType File -Path (Join-Path $outputRoot '.nojekyll') -Force | Out-Null

Write-Host "Version en ligne générée : $outputRoot"
