# Android 版开发说明

Android 版作为独立工程，与 Windows 版共用根目录的 `app.py` 和 `web/index.html`。构建脚本会将共享后端复制到构建目录，Windows 的入口和数据目录不改变。

用户已在手机上确认初版可以打开。新版手机布局和更新流程仍需要在真机上验证；尤其包括 FFmpeg、YouTube 下载、文件选择器、长任务和密钥持久化。

## 安装体验

将 `app/build/outputs/apk/debug/app-debug.apk` 发送到 Android 10 及以上的 64 位手机，在手机文件管理器中打开并安装。系统可能要求允许当前文件管理器安装此 APK。首次启动需要准备媒体组件，可能花费一些时间并占用额外存储空间。

导入视频和字幕时使用系统文件选择器；批量导出时选择 ZIP 的保存位置；合成成片后，可在“已完成的视频”中预览，并点击“保存到手机”选择保存位置。翻译和 AI 分段需要在应用内设置 DeepSeek API Key，YouTube 下载需要手机网络可访问 YouTube。

手机底部依次是“选字幕”“编辑”“素材”和“成片”。连续选句时选择“连续多句”，再依次点第一句和最后一句；编辑页保留视频画面，可试听、循环并分别设置起止时间。保存新选段后可继续选择字幕；编辑已有选段时点击“保存修改”。

## 可选更新

从 0.2.0 开始，应用启动时会检查更新；在设置中也可以手动检查。发现新版本后可以选择“稍后”“忽略此版本”或“下载并安装”，不会强制更新。忽略的版本不会再自动提示，手动检查仍可查看。下载完成后 Android 会要求用户确认安装；第一次可能需要在系统设置中允许此应用安装更新。更新包会校验哈希、包名、版本和签名。

最初的 0.1.0 体验版没有更新功能，需先手动安装一次 0.2.0。请使用与已安装版本相同签名的 APK 覆盖安装；不要通过卸载来解决签名问题，因为卸载会删除应用私有素材和密钥。

版本发布使用 GitHub 的公开发行包和 `android/update.json`。更新检查只读取版本信息，不发送视频、字幕、Cookie 或 API Key；网络或发行包不可用时自动检查会静默结束，手动检查会提示重试。

发布新安卓版时，递增 `versionCode` 和 `versionName`，使用原签名构建，在 GitHub 创建 `android-v<versionCode>` 发行版并上传命名为 `spoken-material-android.apk` 的 APK，随后在 `android/update.json` 中更新版本、下载地址和 APK 的 SHA-256 并推送。仅推送源码不会让手机收到新版本。

## 构建环境

- JDK 17；工程自带 Gradle 8.14.3 Wrapper。
- Android SDK Platform 35 和 Build Tools 35.0.0。
- 构建机 Python 3.12；可用 `ANDROID_BUILD_PYTHON` 指定可执行文件。
- 依赖 Chaquopy 17.2.0、yt-dlp Android 0.18.1、FFmpeg Android 0.18.1。构建依赖需要联网。
- APK 目标 Android 10（API 29）及以上，包含 ARM64 和 x86_64；其他设备架构未覆盖。

Android SDK 许可应由使用者阅读并确认。环境准备完成后，在 `android` 目录执行 `gradlew.bat assembleDebug`，输出位于 `app/build/outputs/apk/debug/`。

本机体验版使用 `.android-download/preferences/debug.keystore` 签名，构建时需将 `ANDROID_USER_HOME` 指向该 `preferences` 目录。保留此签名文件的安全备份；它不能提交到 Git、放进发行包或公开分享。新电脑使用不同签名构建的 APK 无法覆盖当前安装。

2026-11-04 在 Windows 构建机完成 `assembleDebug`，APK v2 签名检查通过，包含 ARM64 与 x86_64。Windows 后端回归与隔离桌面浏览器回归通过，Android 页面与平台桥接使用模拟接口测试通过。按用户要求未运行模拟器或连接真机，真实设备功能尚待验证。

## 设计

应用使用 Android WebView 加载仅监听手机回环地址的本地 Python 服务；视频、字幕、生成结果和 Cookie 存在应用私有目录。导入使用系统文件选择器，合成成片通过系统“保存到手机”选择目标位置，批量散件通过 ZIP 保存。Key 使用 Android Keystore 加密并保存在应用私有目录，应用关闭系统备份；卸载应用会删除应用私有数据。

FFmpeg 和 QuickJS 来自 youtubedl-android，图像题卡使用 Android 版 Pillow。AI 仅接收英文字幕文本。YouTube 需要手机能够访问对应服务；下载器的工作状态仍需真机与实际网络验证。

Android 依赖 [youtubedl-android](https://github.com/yausername/youtubedl-android) 的下载器和 FFmpeg 组件（GPL-3.0），其他组件及其许可证见构建依赖的各自项目。

已静态检查上游 0.18.1 AAR：ARM64 与 x86_64 包含 FFmpeg、ffprobe、QuickJS；ARM64 的 FFmpeg 包含 libx264 动态库。此检查不能替代 Android 编译和实际设备执行。

当前没有为长任务实现后台服务。合成或下载期间需保持应用前台，并关注手机存储和电量；Android 可能在退出或切到后台后中断任务。
