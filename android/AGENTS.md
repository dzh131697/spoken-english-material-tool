# Android 定位与构建

## 入口

- `app/src/main/java/com/spokenmaterial/app/MainActivity.java`：WindowInsets、WebView、本地服务生命周期、文件选择和 `AndroidHost`。顶部被状态栏遮挡先查 `onCreate()`，不必读完整网页和后端。
- 同目录 `AndroidUpdate.java`：可选更新、下载校验和系统安装；相关权限及 FileProvider 见 `app/src/main/AndroidManifest.xml`、`app/src/main/res/xml/`。
- `app/src/main/python/mobile.py`：Android 私有路径、原生媒体组件、密钥桥接。修改它可运行根目录 `python test_android_bridge.py`；这是模拟组件测试。
- `app/build.gradle`：直接将根目录 `web/` 用作 assets，`syncSharedSource` 复制根目录 `app.py` 到生成目录。修改源文件，不修改 `app/build/` 副本。
- 网页改动先读 `../web/AGENTS.md`；自动发布先读 `../.github/AGENTS.md`。环境安装和使用说明按需查 `README.md`。

## 本机构建

优先复用已有 SDK、Gradle 和 Python，不重复搜索整盘或安装环境。JDK 17、Python 3.12、SDK 35；本地默认版本在 `app/build.gradle`，线上版本以 `update.json` 为准，不能把默认版本当成最新发布版。

在项目根目录使用以下环境，然后执行构建（Python 路径须指向已确认可运行的 3.12；若未设置，先检查现有构建环境）：

```powershell
$env:ANDROID_HOME = Join-Path $PWD '.android-sdk'
$env:ANDROID_USER_HOME = Join-Path $PWD '.android-download/preferences'
$env:GRADLE_USER_HOME = Join-Path $PWD '.android-download/gradle'
$env:PIP_DEFAULT_TIMEOUT = '30'
$env:PIP_RETRIES = '1'
# 需要指定 Python 时：$env:ANDROID_BUILD_PYTHON = '<已确认的 Python 3.12 可执行文件>'
./android/gradlew.bat -p android assembleDebug --console=plain
```

- 上述 SDK/缓存路径是本机约定；其他机器复用其实际配置。保留 `ANDROID_USER_HOME` 对应的原签名，不生成替代签名解决覆盖安装问题。签名不得打印、提交或分发；不运行模拟器，除非用户改变此前要求。
- 缓存齐全时可加 `--offline`；它只约束 Gradle，Chaquopy 的 pip 仍可能联网。不要把它当成完全离线构建。
- Wrapper 下载失败而已有同版本 Gradle 时，定向查 `~/.gradle/wrapper/dists/gradle-8.14.3-bin/` 一次并复用；不要清缓存、重装 SDK 或多次启动构建碰运气。
- 构建运行中只跟踪同一个会话，间隔约 30–60 秒读取增量结果。异常停滞时检查最后任务和相关错误；若卡在 `installDebugPythonRequirements`，先核对 Python、pip 超时和网络。确认旧任务结束后再重试，不并发启动第二个构建，不遍历输出全部进程命令行。
- 交付本地 APK 时用 SDK 的 `aapt dump badging` 和 `apksigner verify --print-certs` 核对包名、版本和原签名；输出为 `app/build/outputs/apk/debug/app-debug.apk`。这些检查不能替代真机覆盖安装和界面验证。
- 本地预览不回写线上 `update.json`。需要公开更新时走现有 Actions，不再手工上传大 APK；发布授权按当前会话要求处理。
- PowerShell 传版本属性时给整个参数加引号，如 `'-PandroidVersionName=0.2.1002-preview'`。本地体验包避免低于已安装版本，也避免随意抢占未来云端版本号；本次采用与线上清单相同的 versionCode、预览版 versionName 手动覆盖，后续云端递增版本仍能提示更新。
