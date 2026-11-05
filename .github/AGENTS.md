# Android 自动发布

- 唯一流程入口：`workflows/android.yml`。修改前读取它；触发条件、SDK 包列表、版本算法和发布顺序以文件为准。
- 现有流程在 main 的 Android 源码、共享 `app.py`、`web/` 或工作流变动时构建，支持手动触发。注意 `web/AGENTS.md` 也匹配当前 `web/**`；文档提交如要推送，应先说明会触发构建，不擅自改触发规则。
- 版本使用 `1000 + GITHUB_RUN_NUMBER`，通过 Gradle 属性覆盖本地默认值。签名来自 `ANDROID_KEYSTORE_BASE64` Secret，证书指纹已有固定校验；不要重新生成签名或将 Secret 内容写进日志。
- 必须先成功发布 APK，再提交 `android/update.json`；清单单独变动不触发构建，重试已发布版本复用原 APK，不覆盖线上字节。
- SDK 准备已显式指定 `platform-tools platforms;android-35 build-tools;35.0.0`，不要退回 setup-android 默认旧 `tools` 包（曾导致首次云端构建失败）。
- 2026-11-04 聊天记录确认第二次云端构建发布过 0.2.1002，本地 `android/update.json` 也记录该版本；这是历史证据。实际发布任务仍应查询对应提交的 Actions、Release 和清单，不能仅凭文档声称当前发布成功。
- 用户已授权本项目完成后直接提交并推送 `main`，无需逐次确认。正常交付复用 Actions：推送源码 → 跟踪该次 run → 核对 Release 与清单版本、地址和哈希。云端签名/版本校验已通过且无新风险时，不必再下载整个 APK 重做同一套检查。
- 工作流改动先检查相关 YAML、脚本和触发路径；只在改动影响构建配置时补 Gradle 验证。普通文档改动无需完整构建。失败先取失败步骤的日志，不全量输出整个 run 或反复查相同状态。
