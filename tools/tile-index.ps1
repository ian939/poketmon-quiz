# 책 인덱스 사진(3000x4000)을 판독 가능한 타일로 잘라 저장한다.
# 표가 세로 열로 구성되어 있어 가로 3분할 x 세로 3분할 = 9타일/장.
Add-Type -AssemblyName System.Drawing

$projRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
# 인덱스 사진은 카메라 파일명(숫자.jpg). 표지는 제외.
$src = Get-ChildItem -Path $projRoot -File -Filter '*.jpg' |
  Where-Object { $_.BaseName -match '^\d+$' } |
  Sort-Object Name |
  Select-Object -ExpandProperty FullName
Write-Output ("인덱스 사진 {0}장: {1}" -f $src.Count, (($src | Split-Path -Leaf) -join ', '))
$outDir = Join-Path $PSScriptRoot '..\_tiles'
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

$cols = 3
$rows = 3
$overlap = 60   # 경계에서 글자가 잘리지 않도록 약간 겹치게 자른다

foreach ($full in $src) {
  $img = [System.Drawing.Image]::FromFile($full)
  $tw = [int]($img.Width / $cols)
  $th = [int]($img.Height / $rows)
  $stem = [System.IO.Path]::GetFileNameWithoutExtension($full)

  for ($c = 0; $c -lt $cols; $c++) {
    for ($r = 0; $r -lt $rows; $r++) {
      $x = [Math]::Max(0, $c * $tw - $overlap)
      $y = [Math]::Max(0, $r * $th - $overlap)
      $w = [Math]::Min($img.Width - $x, $tw + 2 * $overlap)
      $h = [Math]::Min($img.Height - $y, $th + 2 * $overlap)
      $rect = New-Object System.Drawing.Rectangle $x, $y, $w, $h
      $tile = New-Object System.Drawing.Bitmap $w, $h
      $g = [System.Drawing.Graphics]::FromImage($tile)
      $g.DrawImage($img, (New-Object System.Drawing.Rectangle 0, 0, $w, $h), $rect, [System.Drawing.GraphicsUnit]::Pixel)
      $g.Dispose()
      $name = "{0}_c{1}r{2}.png" -f $stem, $c, $r
      $tile.Save((Join-Path $outDir $name), [System.Drawing.Imaging.ImageFormat]::Png)
      $tile.Dispose()
      Write-Output "$name  ($w x $h)"
    }
  }
  $img.Dispose()
}
Write-Output "저장 위치: $((Resolve-Path $outDir).Path)"
