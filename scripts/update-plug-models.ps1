param(
  [ValidateSet("Audit", "Apply")]
  [string]$Mode = "Audit",
  [string]$SourceRoot,
  [string]$ManifestPath = "assets/models/plugs/model-source-manifest.json"
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$manifestFullPath = (Resolve-Path (Join-Path $projectRoot $ManifestPath)).Path
$manifest = Get-Content -LiteralPath $manifestFullPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $SourceRoot) { $SourceRoot = $manifest.sourceRoot }
$sourceRootPath = (Resolve-Path -LiteralPath $SourceRoot).Path
$targetRootPath = (Resolve-Path -LiteralPath (Join-Path $projectRoot "assets/models/plugs")).Path

if ($manifest.models.Count -ne 37) {
  throw "Le manifeste doit contenir exactement 37 modèles, pas $($manifest.models.Count)."
}

$duplicateSources = $manifest.models | Group-Object source | Where-Object Count -gt 1
$duplicateTargets = $manifest.models | Group-Object target | Where-Object Count -gt 1
$duplicateIds = $manifest.models | Group-Object modelId | Where-Object Count -gt 1
if ($duplicateSources -or $duplicateTargets -or $duplicateIds) {
  throw "Le manifeste contient une source, une cible ou un identifiant en double."
}

$audit = foreach ($entry in $manifest.models) {
  $sourcePath = [IO.Path]::GetFullPath((Join-Path $sourceRootPath $entry.source))
  $targetPath = [IO.Path]::GetFullPath((Join-Path $targetRootPath $entry.target))
  if (-not $sourcePath.StartsWith($sourceRootPath, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Source hors du dossier autorisé : $sourcePath"
  }
  if (-not $targetPath.StartsWith($targetRootPath, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Cible hors du dossier autorisé : $targetPath"
  }
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Source absente : $sourcePath"
  }
  if (-not (Test-Path -LiteralPath $targetPath -PathType Leaf)) {
    throw "Cible absente : $targetPath"
  }

  $sourceFile = Get-Item -LiteralPath $sourcePath
  $targetFile = Get-Item -LiteralPath $targetPath
  $sourceHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash
  $previousHash = (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash

  [pscustomobject]@{
    modelId = $entry.modelId
    source = $entry.source
    target = $entry.target
    sourceBytes = $sourceFile.Length
    previousTargetBytes = $targetFile.Length
    sourceSha256 = $sourceHash
    previousTargetSha256 = $previousHash
    changed = $sourceHash -ne $previousHash
  }
}

if ($Mode -eq "Apply") {
  foreach ($entry in $audit) {
    $sourcePath = [IO.Path]::GetFullPath((Join-Path $sourceRootPath $entry.source))
    $targetPath = [IO.Path]::GetFullPath((Join-Path $targetRootPath $entry.target))
    if ($entry.changed) {
      Copy-Item -LiteralPath $sourcePath -Destination $targetPath -Force
    }
    $copiedHash = (Get-FileHash -LiteralPath $targetPath -Algorithm SHA256).Hash
    if ($copiedHash -ne $entry.sourceSha256) {
      throw "La vérification après copie a échoué pour $($entry.modelId)."
    }
  }
  $integrityPath = Join-Path $targetRootPath "model-integrity.json"
  $integrity = [ordered]@{
    schemaVersion = 1
    generatedFor = "v0.10-260929"
    models = @($audit | ForEach-Object {
      [ordered]@{
        modelId = $_.modelId
        target = $_.target
        bytes = $_.sourceBytes
        sha256 = $_.sourceSha256
      }
    })
  }
  [IO.File]::WriteAllText($integrityPath, ($integrity | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
}

$changedCount = @($audit | Where-Object changed).Count
$unchangedCount = $audit.Count - $changedCount
$audit | Select-Object modelId, sourceBytes, previousTargetBytes, changed
Write-Host "Contrôle terminé : $($audit.Count) modèles, $changedCount différents, $unchangedCount déjà identiques."
if ($Mode -eq "Apply") {
  Write-Host "Remplacement et contrôle SHA-256 terminés pour les $($audit.Count) modèles."
}
