$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$outputRoot = Join-Path $PSScriptRoot 'dist'
$expectedPrefix = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
$resolvedOutput = [IO.Path]::GetFullPath($outputRoot)

if (-not $resolvedOutput.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Le dossier de sortie doit rester dans le dossier online."
}

if (Test-Path -LiteralPath $outputRoot) {
  Remove-Item -LiteralPath $outputRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $outputRoot | Out-Null

$applicationFiles = @('index.html', 'app.js', 'welcome.js', 'style.css', 'welcome.css')
foreach ($relativePath in $applicationFiles) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $relativePath) -Destination $outputRoot
}

foreach ($directoryName in @('assets')) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $directoryName) -Destination $outputRoot -Recurse
}

Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'auth.js') -Destination $outputRoot
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'online.css') -Destination $outputRoot

$indexPath = Join-Path $outputRoot 'index.html'
$index = Get-Content -LiteralPath $indexPath -Raw -Encoding UTF8
$index = $index.Replace(
  '<link rel="stylesheet" href="./welcome.css?v=20260914-png-preview-v05" />',
  '<link rel="stylesheet" href="./welcome.css?v=20260914-png-preview-v05" />' + [Environment]::NewLine + '    <link rel="stylesheet" href="./online.css?v=20260914-png-preview-v05" />'
)

$gateMarkup = @'
  <body class="is-welcome auth-locked">
    <section id="access-gate" class="access-gate" aria-labelledby="access-title">
      <div class="access-gate__panel">
        <img class="access-gate__logo" src="./assets/brand/rosebuds-logo.png?v=20260914-png-preview-v05" alt="ROSEBUDS" width="284" height="117" />
        <div>
          <p class="access-gate__eyebrow">ESPACE PROFESSIONNEL</p>
          <h1 id="access-title">Accéder au configurateur</h1>
          <p class="access-gate__intro">Identifiez-vous pour consulter les modèles Rosebuds et ouvrir le viewer 3D.</p>
        </div>
        <form id="access-form" class="access-form" novalidate>
          <label for="access-username">
            <span>Identifiant</span>
            <input id="access-username" name="username" type="text" autocomplete="username" required />
          </label>
          <label for="access-password">
            <span>Mot de passe</span>
            <input id="access-password" name="password" type="password" autocomplete="current-password" required />
          </label>
          <p id="access-error" class="access-error" role="alert" aria-live="polite"></p>
          <button id="access-submit" type="submit">Accéder au configurateur</button>
        </form>
        <p class="access-gate__notice">Accès réservé aux personnes autorisées.</p>
      </div>
    </section>
'@

$index = $index.Replace('  <body class="is-welcome">', $gateMarkup)
$index = $index.Replace(
  '<script src="./welcome.js?v=20260914-png-preview-v05" defer></script>',
  '<script src="./auth.js?v=20260914-png-preview-v05" defer></script>'
)

[IO.File]::WriteAllText($indexPath, $index, [Text.UTF8Encoding]::new($false))
New-Item -ItemType File -Path (Join-Path $outputRoot '.nojekyll') -Force | Out-Null

Write-Host "Version en ligne générée : $outputRoot"
