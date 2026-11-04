$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$devDependencies = Join-Path (Split-Path $PSScriptRoot -Parent) '.build-deps'
python -m pip install --target $devDependencies -r requirements-dev.txt
if ($LASTEXITCODE -ne 0) { throw 'Python 依赖安装失败' }
$env:PYTHONPATH = $devDependencies
$toolDirectory = Join-Path $PSScriptRoot 'tools'
New-Item -ItemType Directory -Path $toolDirectory -Force | Out-Null
$ffmpegBinary = Get-ChildItem -LiteralPath (Join-Path $devDependencies 'imageio_ffmpeg/binaries') -Filter 'ffmpeg*.exe' | Select-Object -First 1
if (-not $ffmpegBinary) { throw '缺少 FFmpeg 二进制文件' }
Copy-Item -LiteralPath $ffmpegBinary.FullName -Destination (Join-Path $toolDirectory 'ffmpeg.exe') -Force
$nodeBinary = Get-Command node.exe -ErrorAction Stop
Copy-Item -LiteralPath $nodeBinary.Source -Destination (Join-Path $toolDirectory 'node.exe') -Force
Write-Host '开发环境已准备。当前终端可执行 python app.py / python test_app.py / python build.py。'
Write-Host '浏览器测试可选：npm install，然后 npm run test:browser（需要 Edge 与已打包程序）。'
