# GitHub 安装包发布

更新日期：2026-10-23

完整的双仓库提交、版本发布、令牌设置和失败重试步骤见 [代码推送与安装包发布](releasing.md)。

## 下载入口

[小助手 Releases](https://github.com/maoxiaoquan/my-assistant/releases) → 选择版本 → 展开 **Assets** → 下载安装包。公开仓库的公开 Release 可供其他人下载；私有仓库仍需要仓库访问权限，草稿只有有权限的维护者可见。

## 自动发布流程

`.github/workflows/release.yml` 在向 GitHub 推送 `v*` 标签时触发构建，普通代码提交和推送不会发布。手动 Run workflow 用于补同步已有 GitHub Release 到 Gitee，不会重新构建。

1. 检查标签与 Node、Tauri、Cargo 及锁文件的版本一致，运行测试和前端构建。
2. Windows x64 构建 EXE/MSI；macOS Apple Silicon、Intel 分别构建 DMG；Linux x64 构建 DEB/AppImage。
3. 四个构建任务全部成功后收集六个安装包，生成 SHA-256 校验文件。
4. 创建 Release 草稿，上传全部文件后自动公开。有 `-beta.1` 等后缀的版本标记为预发布。
5. 使用 `GITEE_TOKEN` 将相同附件同步到 Gitee；缺少令牌或同步失败会让 `sync-gitee` 任务失败，但 GitHub 已发布附件仍可下载。

构建失败不会新建公开 Release；在 Actions 查看失败日志，修复后发布新版本，或对临时网络失败使用 Re-run failed jobs。上传中断会留下草稿，重跑发布任务可继续上传。完整重跑会替换同名附件，因此已公开版本的源码标签应保持不变。

流程使用 GitHub 自带 `GITHUB_TOKEN`，不需要创建个人访问令牌。仓库需允许 GitHub Actions 和流程使用的 actions；发布任务有 `contents: write` 权限。此流程不包含应用内自动升级。

## 发布入口

当前两个远程统一使用 `main`，具体提交、推送和标签命令请按 [统一发布指南](releasing.md) 操作：先推 Gitee 的代码与标签，再推 GitHub 的对应标签。

`v0.1.0` 已创建，但 Windows 打包失败，没有公开安装包；修复后的版本为 `v0.1.1`。不要重建或移动旧标签。GitHub 发布完成后先验证 Gitee 默认分支，再同步附件；旧版本可用 Run workflow 补同步。

## 后续版本

- 更新 `package.json`、`package-lock.json`（含根 package 版本）、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock` 中本应用版本。
- 更新 `docs/release-notes.md` 为该版更新说明，提交后用新标签发布，例如 `v0.1.1`。
- 可先在本地运行 `$env:RELEASE_TAG='v0.1.1'; node scripts/check-release.mjs` 校验版本。

## 平台与签名

安装包构建不等于跨平台功能验收。Windows 原生屏幕捕获与其他系统的 WebView 捕获能力有差异，详见 README。macOS 单独开启透明窗口所需的私有 API；此配置用于仓库外部分发，不适用于 Mac App Store。

当前未配置 Windows 代码签名或 Apple Developer ID 公证。macOS 构建使用 ad-hoc 签名，首次安装仍可能被系统拦截。面向正式用户分发时，应按 [Tauri Windows 签名](https://v2.tauri.app/distribute/sign/windows/) 和 [Tauri macOS 签名与公证](https://v2.tauri.app/distribute/sign/macos/) 配置证书与 GitHub Secrets，再替换当前签名设置。

流程参考 [Tauri GitHub Actions 发布文档](https://v2.tauri.app/distribute/pipelines/github/) 与 [tauri-action](https://github.com/tauri-apps/tauri-action)。
