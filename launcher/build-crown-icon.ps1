$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$source = [Drawing.Bitmap]::FromFile((Join-Path $root 'assets/brand/rosebuds-logo.png'))
# Crop only the original crown, excluding the ROSEBUDS wordmark.
$crop = [Drawing.Rectangle]::new(335, 0, 230, 210)
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$images = @()
try {
  foreach ($size in $sizes) {
    $bitmap = [Drawing.Bitmap]::new($size, $size)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    try {
      $graphics.Clear([Drawing.Color]::White)
      $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighQuality
      $margin = [Math]::Max(1, [int]($size * 0.05))
      $graphics.DrawImage($source, [Drawing.Rectangle]::new($margin, $margin, $size - 2*$margin, $size - 2*$margin), $crop, [Drawing.GraphicsUnit]::Pixel)
      $stream = [IO.MemoryStream]::new()
      $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
      $images += ,$stream.ToArray()
      $stream.Dispose()
      if ($size -eq 256) { $bitmap.Save((Join-Path $root 'assets/icons/rosebuds-launcher.png'), [Drawing.Imaging.ImageFormat]::Png) }
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
  }
  $stream = [IO.MemoryStream]::new()
  $writer = [IO.BinaryWriter]::new($stream)
  $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Count)
  $offset = 6 + 16 * $sizes.Count
  for ($i = 0; $i -lt $sizes.Count; $i++) {
    $dimension = if ($sizes[$i] -eq 256) { 0 } else { $sizes[$i] }
    $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
    $writer.Write([byte]0); $writer.Write([byte]0)
    $writer.Write([uint16]1); $writer.Write([uint16]32)
    $writer.Write([uint32]$images[$i].Length); $writer.Write([uint32]$offset)
    $offset += $images[$i].Length
  }
  foreach ($bytes in $images) { $writer.Write([byte[]]$bytes) }
  [IO.File]::WriteAllBytes((Join-Path $root 'assets/icons/rosebuds-launcher.ico'), $stream.ToArray())
  $writer.Dispose(); $stream.Dispose()
} finally { $source.Dispose() }
