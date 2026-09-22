param(
  [Parameter(Mandatory = $true)][string]$Emoji,
  [int]$Size = 512,
  [Parameter(Mandatory = $true)][string]$Out
)

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.InterpolationMode = 'HighQualityBicubic'
$g.Clear([System.Drawing.Color]::Transparent)

# rounded gradient tile background
$bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
  (New-Object System.Drawing.Point(0, 0)),
  (New-Object System.Drawing.Point($Size, $Size)),
  [System.Drawing.Color]::FromArgb(255, 79, 140, 255),
  [System.Drawing.Color]::FromArgb(255, 124, 92, 255))
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$pad = [int]($Size * 0.04)
$d = $Size - 2 * $pad
$corner = [int]($Size * 0.22)
$path.AddArc($pad, $pad, $d, $d, 180, 90)
$path.AddArc(($Size - $pad - $d), $pad, $d, $d, 270, 90)
$path.AddArc(($Size - $pad - $d), ($Size - $pad - $d), $d, $d, 0, 90)
$path.AddArc($pad, ($Size - $pad - $d), $d, $d, 90, 90)
$path.CloseFigure()
$g.FillPath($bg, $path)

# emoji via TextRenderer (GDI Uniscribe -> color glyphs in Segoe UI Emoji)
$font = New-Object System.Drawing.Font('Segoe UI Emoji', [float]($Size * 0.42), [System.Drawing.FontStyle]::Regular)
$flags = [System.Windows.Forms.TextFormatFlags]::HorizontalCenter -bor
       [System.Windows.Forms.TextFormatFlags]::VerticalCenter -bor
       [System.Windows.Forms.TextFormatFlags]::NoPrefix
[System.Windows.Forms.TextRenderer]::DrawText($g, $Emoji, $font, (New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)), [System.Drawing.Color]::White, $flags)

$g.Dispose()
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Host "icon written: $Out"
