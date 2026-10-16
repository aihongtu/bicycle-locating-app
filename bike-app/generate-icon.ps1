# 生成自行车定位助手图标：assets/app-icon.png + app-icon.ico
Add-Type -AssemblyName System.Drawing
$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# 背景：圆角方形，深炭灰蓝
$bgPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$r = 52
$bgPath.AddArc(0,0,2*$r,2*$r,180,90)
$bgPath.AddArc($size-2*$r,0,2*$r,2*$r,270,90)
$bgPath.AddArc($size-2*$r,$size-2*$r,2*$r,2*$r,0,90)
$bgPath.AddArc(0,$size-2*$r,2*$r,2*$r,90,90)
$bgPath.CloseFigure()
$bgBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255,18,26,38))
$g.FillPath($bgBrush, $bgPath)

# 淡青强调色（先建 Brush 再建 Pen，兼容 PS 5.1 构造绑定）
$cyan = [System.Drawing.Color]::FromArgb(255,86,216,226)
$sbC = New-Object System.Drawing.SolidBrush $cyan
$penC    = New-Object System.Drawing.Pen $sbC, ([single]8)
$penC.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$penC.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
$penThin = New-Object System.Drawing.Pen $sbC, ([single]4)
$penThin.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$penThin.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round

function Line($g,$p,$x1,$y1,$x2,$y2){ $g.DrawLine($p, $x1,$y1, $x2,$y2) }

# 自行车（淡青线稿），居中
$g.DrawEllipse($penC, 88-42, 178-42, 84, 84)   # 后轮
$g.DrawEllipse($penC, 180-42, 178-42, 84, 84)  # 前轮
# 车架
Line $g $penC 134 178 92 178      # 后下叉
Line $g $penC 116 116 92 178      # 后上叉
Line $g $penC 134 178 116 116     # 座管
Line $g $penC 116 116 170 100     # 上管
Line $g $penC 134 178 170 104     # 下管
Line $g $penC 170 100 180 178     # 前叉
Line $g $penC 170 100 198 90      # 把手横
Line $g $penC 102 112 132 112     # 坐垫
# 踏板曲柄
Line $g $penC 134 178 134 196
Line $g $penThin 116 198 152 198
# 后轮轴心点
$g.FillEllipse($sbC, 88-5,178-5,10,10)

# 定位锚点：右上角细十字准星
$ax = 200; $ay = 44
$pfColor = [System.Drawing.Color]::FromArgb(200,120,150,170)
$sbF = New-Object System.Drawing.SolidBrush $pfColor
$penF = New-Object System.Drawing.Pen $sbF, ([single]3)
Line $g $penF ($ax-12) $ay ($ax+12) $ay
Line $g $penF $ax ($ay-12) $ax ($ay+12)
$g.DrawEllipse($penF, $ax-3,$ay-3,6,6)

$bmp.Save("$PSScriptRoot\assets\app-icon.png", [System.Drawing.Imaging.ImageFormat]::Png)

# 转 .ico（单尺寸 256，Windows 会缩放）
$hIcon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$fs = [System.IO.File]::Create("$PSScriptRoot\assets\app-icon.ico")
$icon.Save($fs)
$fs.Close()
$icon.Dispose()
$g.Dispose(); $bmp.Dispose()
Write-Host "OK: assets\app-icon.png / app-icon.ico"
