# 口语素材工作台 · 源码交接包

本仓库保留 Windows 便携版，并新增独立 Android 工程。Android 体验版安装及构建说明见 [android/README.md](android/README.md)。

此包供另一台 Windows 电脑的 Agent 继续开发。普通使用者请使用单独的 Windows 便携版 ZIP。

## 接手步骤

1. 将整个源码包解压到独立的可写目录，例如 `D:\EnglishVideoTool\口语素材工具`。
2. 在 Agent 中打开这个项目目录，把 `接手提示词.md` 中的提示词发给它。
3. 开发机安装 Windows x64 Python 3.14 和 Node.js 22 或更高版本，并确保 `python` 和 `node` 可从终端运行。当前原机使用 Python 3.14.5；新机器仍需实际验证。
4. 在项目目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\setup-dev.ps1
```

该命令仅对这次脚本运行指定执行策略，不修改系统策略。联网获取 Python 依赖，放到项目上一级的 `.build-deps`；FFmpeg、Node 复制到项目 `tools`。若组织策略禁止脚本运行，请按脚本内容手动执行对应命令，不更改组织策略。

脚本结束后，在当前 PowerShell 配置依赖路径：

```powershell
$env:PYTHONPATH = (Resolve-Path ..\.build-deps).Path
python app.py
```

每个新终端都需重新设置该变量。使用 DeepSeek 时只在启动后的网页中填 Key。

## 测试与打包

```powershell
$env:PYTHONPATH = (Resolve-Path ..\.build-deps).Path
python test_app.py
python build.py
```

浏览器端到端测试为可选开发依赖，需要系统安装 Edge、已生成 `dist/启动工具`：

```powershell
npm install
npm run test:browser
```

测试会生成合成视频和选段，保存在 `qa` 以及打包程序的测试数据目录。不要在装有真实素材的便携目录上运行浏览器测试。

生成干净便携包：

```powershell
python package_release.py
```

此脚本会复制到 `Windows便携版/口语素材工作台` 并压缩。应在新的发行暂存目录首次运行；脚本目前采用覆盖合并复制，重复运行前需检查旧暂存数据，不能把已有用户素材混入发行包。

## 文档导航

- `使用说明.md`：面向使用者的操作步骤。
- `交接说明.md`：需求边界、源码入口、已知问题和下一步。
- `开发说明.md`：原机的实际验证记录。
- `接手提示词.md`：复制给另一台电脑 Agent 的开场提示词。
- `提示词/翻译提示词.md`：现有翻译 system prompt 的可阅读副本，实际运行以 `app.py` 为准。
- `AGENTS.md`：继续开发时应遵守的约束。

源码包不含 API Key、用户视频、Python 依赖、Node/FFmpeg 二进制、打包产物。安装依赖需要联网；源码在新机器可重建的程度仍以新机器实测为准。
