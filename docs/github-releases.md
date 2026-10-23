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

## 首次发布 v0.1.0

先提交发布配置，检查 `docs/release-notes.md`，再执行：

```powershell
git push origin-github main
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin-github v0.1.0
```

请仅在标签尚不存在时创建。代码和标签必须包含本发布流程。前往仓库 **Actions → Release installers** 等待构建；完成后 Releases 中会出现可下载的软件。发布到 Gitee 不会触发 GitHub Actions。

以上为仅 GitHub 的初始步骤。当前同时发布 Gitee 时，须先推送 `origin-gitee main`，并在 GitHub 标签推送之前推送相同的 `origin-gitee v0.1.0`。`v0.1.0` 已创建，不要重复创建或移动；首版补同步步骤见统一发布指南。

## 后续版本

- 更新 `package.json`、`package-lock.json`（含根 package 版本）、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`、`src-tauri/Cargo.lock` 中本应用版本。
- 更新 `docs/release-notes.md` 为该版更新说明，提交后用新标签发布，例如 `v0.1.1`。
- 可先在本地运行 `$env:RELEASE_TAG='v0.1.1'; node scripts/check-release.mjs` 校验版本。

## 平台与签名

安装包构建不等于跨平台功能验收。Windows 原生屏幕捕获与其他系统的 WebView 捕获能力有差异，详见 README。macOS 单独开启透明窗口所需的私有 API；此配置用于仓库外部分发，不适用于 Mac App Store。

当前未配置 Windows 代码签名或 Apple Developer ID 公证。macOS 构建使用 ad-hoc 签名，首次安装仍可能被系统拦截。面向正式用户分发时，应按 [Tauri Windows 签名](https://v2.tauri.app/distribute/sign/windows/) 和 [Tauri macOS 签名与公证](https://v2.tauri.app/distribute/sign/macos/) 配置证书与 GitHub Secrets，再替换当前签名设置。

流程参考 [Tauri GitHub Actions 发布文档](https://v2.tauri.app/distribute/pipelines/github/) 与 [tauri-action](https://github.com/tauri-apps/tauri-action)。
