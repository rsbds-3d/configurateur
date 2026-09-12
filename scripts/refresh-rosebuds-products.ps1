$ErrorActionPreference = 'Stop'
$sources = @('https://rosebuds.net/fr/6-gamme-originale-inox', 'https://rosebuds.net/fr/7-gamme-originale-alu')
$urls = foreach ($source in $sources) {
  $page = Invoke-WebRequest -Uri $source -UseBasicParsing
  foreach ($link in $page.Links) {
    if ($link.href -match '^https://rosebuds\.net/fr/gamme-originale-(inox|alu)/\d+[^/]*\.html') {
      [string]$link.href
    }
  }
}
$data = [ordered]@{ checkedAt = (Get-Date -Format 'yyyy-MM-dd'); sources = $sources; urls = @($urls | Sort-Object -Unique) }
$output = Join-Path (Split-Path -Parent $PSScriptRoot) 'assets/data/rosebuds-products.json'
New-Item -ItemType Directory -Path (Split-Path -Parent $output) -Force | Out-Null
[IO.File]::WriteAllText($output, ($data | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
Write-Output "Catalogue Rosebuds : $($data.urls.Count) liens de variantes."
