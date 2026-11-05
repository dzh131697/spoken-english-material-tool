# 共享网页

- 正式页面是 `index.html`，由 Windows 和 Android 共用；根目录 `android-layout-preview.html` 是独立示例预览，修改它不会改变 APK。
- 发布准备页在 `publish.js` / `publish.css`：每条成片独立编辑平台文案和多画幅封面，PNG 直接保存预览画布。后端入口为 `app.py` 的 `save_publication()` / `generate_publication()` / `cover_frame()`；Android 启动时需同时复制这两个静态资源。新增成片保存选段快照，旧成片不能套用当前素材列表。
- 发布编辑区用 `selectPublishTab()` 切换封面、标题、简介、标签、参考；只隐藏面板，保留各页输入。顶部保存与发布包入口作用于整条成片，验证失败应定位到对应平台和标签页。
- Android 分支入口为 `isAndroid`、`setupMobile()`；手机页面切换查 `showMobilePage()`，连续选句查 `renderMobileSelection()`，素材保存查 `getClip()` / `save()`，AI 审核查 `applySegments()`。先定位元素 ID、事件和对应函数，再读必要范围。
- 保留 Windows 行为；手机编辑页必须能看到视频并试听，保留现有视频元素和切点逻辑。状态栏、刘海、键盘安全区域由原生 `MainActivity.onCreate()` 的 WindowInsets 处理，相关问题先查原生，避免叠加固定 CSS 顶部空白。
- 页面通过 `api()` / `job()` 调用本机后端，通过 `window.AndroidHost` 调用原生能力；改协议才读取对应后端或原生方法。
- 页面改动优先在根目录运行 `node test_android_web.cjs`，使用模拟项目、媒体与 Android 桥接；它能检查手机和桌面页面行为，不能证明真实视频播放、手机安全区域或系统安装正常。Playwright 已配置时直接复用，不重复安装。
- 仅需排版调整时检查相关页面和窄屏即可；涉及保存、桥接或桌面共用行为时跑对应回归。需要 APK 时再按 `android/AGENTS.md` 构建，不为每次页面检查先打包 Windows 版。
