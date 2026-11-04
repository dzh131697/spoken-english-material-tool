# Android 版开发说明

Android 版作为独立工程，与 Windows 版共用根目录的 `app.py` 和 `web/index.html`。构建脚本会将共享后端复制到构建目录，Windows 的入口和数据目录不改变。

当前已生成调试签名的 Android 体验版 APK，尚未进行模拟器或真机验证。尤其需要在手机上验证 FFmpeg、YouTube 下载、文件选择器、长任务和密钥持久化。

## 安装体验

将 `app/build/outputs/apk/debug/app-debug.apk` 发送到 Android 10 及以上的 64 位手机，在手机文件管理器中打开并安装。系统可能要求允许当前文件管理器安装此 APK。首次启动需要准备媒体组件，可能花费一些时间并占用额外存储空间。

导入视频和字幕时使用系统文件选择器；批量导出时选择 ZIP 的保存位置；合成成片后，可在“已完成的视频”中预览，并点击“保存到手机”选择保存位置。翻译和 AI 分段需要在应用内设置 DeepSeek API Key，YouTube 下载需要手机网络可访问 YouTube。

## 构建环境

- JDK 17；工程自带 Gradle 8.14.3 Wrapper。
- Android SDK Platform 35 和 Build Tools 35.0.0。
- 构建机 Python 3.12；可用 `ANDROID_BUILD_PYTHON` 指定可执行文件。
- 依赖 Chaquopy 17.2.0、yt-dlp Android 0.18.1、FFmpeg Android 0.18.1。构建依赖需要联网。
- APK 目标 Android 10（API 29）及以上，包含 ARM64 和 x86_64；其他设备架构未覆盖。

Android SDK 许可应由使用者阅读并确认。环境准备完成后，在 `android` 目录执行 `gradlew.bat assembleDebug`，输出位于 `app/build/outputs/apk/debug/`。

2026-11-04 在 Windows 构建机完成 `assembleDebug`，APK v2 签名检查通过，包含 ARM64 与 x86_64。Windows 后端回归与隔离桌面浏览器回归通过，Android 页面与平台桥接使用模拟接口测试通过。按用户要求未运行模拟器或连接真机，真实设备功能尚待验证。

## 设计

应用使用 Android WebView 加载仅监听手机回环地址的本地 Python 服务；视频、字幕、生成结果和 Cookie 存在应用私有目录。导入使用系统文件选择器，合成成片通过系统“保存到手机”选择目标位置，批量散件通过 ZIP 保存。Key 使用 Android Keystore 加密并保存在应用私有目录，应用关闭系统备份；卸载应用会删除应用私有数据。

FFmpeg 和 QuickJS 来自 youtubedl-android，图像题卡使用 Android 版 Pillow。AI 仅接收英文字幕文本。YouTube 需要手机能够访问对应服务；下载器的工作状态仍需真机与实际网络验证。

Android 依赖 [youtubedl-android](https://github.com/yausername/youtubedl-android) 的下载器和 FFmpeg 组件（GPL-3.0），其他组件及其许可证见构建依赖的各自项目。

已静态检查上游 0.18.1 AAR：ARM64 与 x86_64 包含 FFmpeg、ffprobe、QuickJS；ARM64 的 FFmpeg 包含 libx264 动态库。此检查不能替代 Android 编译和实际设备执行。

当前没有为长任务实现后台服务。合成或下载期间需保持应用前台，并关注手机存储和电量；Android 可能在退出或切到后台后中断任务。
