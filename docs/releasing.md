# 代码推送与安装包发布

更新日期：2026-10-30

版本记录：`v0.1.0` 的首次 CI 在 Windows 打包步骤失败，未生成公开发行版；修正安装器配置及双仓库流程后使用 `v0.1.1` 发布，保留旧标签历史。本次原生捕获、提醒及界面设置更新使用 `v0.2.0`；发布说明保存在 `docs/release-notes.md`。

本项目的开发分支是 `main`，两个远程仓库分别是：

| 远程名 | 用途 | 地址 |
| --- | --- | --- |
| `origin-github` | 源码、跨平台构建、安装包发布 | https://github.com/vito2088/ai-assistant |
| `origin-gitee` | 源码镜像 | https://gitee.com/maoxiaoquan/my-assistant |

GitHub 地址已迁移为 `vito2088/ai-assistant`。旧克隆可执行 `git remote set-url origin-github https://github.com/vito2088/ai-assistant.git` 更新地址，再用 `git remote -v` 检查；Gitee 地址保持原值。

## 一、日常提交代码（不发布软件）

在项目根目录执行：

```powershell
git status
npm test
npm run build
git add README.md src docs
git diff --cached --stat
git commit -m "feat: 描述本次功能"
git push origin-gitee main
git push origin-github main
```

`git add` 中的路径按本次修改填写。例如改了 Rust 或发布流程，需要额外加入 `src-tauri`、`.github`、`scripts`、`package.json` 等对应文件。不要加入 `node_modules`、`dist`、`target`、个人数据或令牌。只有一个远程推送成功时，另一个可单独重试；不需要再次提交。

**普通分支推送只更新代码。推送版本标签才会触发安装包构建。**

## 二、首次准备

1. GitHub 与 Gitee 仓库都应允许当前账号推送。面向公众提供下载需要公开仓库。
2. GitHub 开启 Actions，允许项目流程使用的 actions。跨平台构建使用 GitHub 托管运行器，无需本机同时安装三种系统。
3. 两个远程仓库统一使用 `main` 为开发和默认分支。若旧克隆仍停在 `master`，先保存未提交修改，再执行 `git fetch origin-github` 和 `git switch --track origin-github/main`（已有本地 main 时执行 `git switch main`）。

GitHub 发布使用内置 `GITHUB_TOKEN`，不需要额外配置个人令牌。Gitee 只保留源码镜像，不再上传或同步安装包，发布流程不依赖 Gitee API、令牌或默认分支配置任务。独立的 `Configure Gitee default branch` 工作流仅用于仓库维护，支持手动触发或显式复用，不随源码推送自动运行，与安装包发布无关。

## 三、发布新版本（例如 v0.2.1）

### 1. 更新版本号与发布说明

以下版本必须全部一致：

- `package.json` 的 `version`
- `package-lock.json` 的顶层版本和 `packages[""].version`
- `src-tauri/tauri.conf.json` 的 `version`
- `src-tauri/Cargo.toml` 的 `[package].version`
- `src-tauri/Cargo.lock` 中 `my-assistant` 包的版本

Node 部分可以运行 `npm version 0.2.1 --no-git-tag-version` 同步两个 JSON 文件；再修改 Tauri/Cargo 版本，并运行 `cargo check --manifest-path src-tauri/Cargo.toml` 更新锁文件。更新 `docs/release-notes.md`，只写本版变更和适用说明。

```powershell
$env:RELEASE_TAG='v0.2.1'
node scripts/check-release.mjs
npm test
npm run build
cargo check --locked --manifest-path src-tauri/Cargo.toml
```

### 2. 提交，先同步代码，再同步标签

```powershell
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json docs/release-notes.md
git commit -m "chore: release v0.2.1"
git push origin-gitee main
git push origin-github main
git tag -a v0.2.1 -m "Release v0.2.1"
git push origin-gitee v0.2.1
git push origin-github v0.2.1
```

每条命令成功后再执行下一条。其他功能修改应在发版前提交。标签只能创建一次；两边可推送同一个本地标签，确保源码一致。**只有向 GitHub 推送版本标签会触发安装包构建和发布**，Gitee 标签仅作源码归档，不影响发布任务。不要修改或强推已公开版本标签，修复后递增版本号再发布。

### 3. 查看发布结果

[GitHub Actions → Release installers](https://github.com/vito2088/ai-assistant/actions/workflows/release.yml) 执行：

1. `check`：版本一致性、测试、前端构建。
2. `build`：Windows x64、macOS ARM64、macOS Intel、Linux x64 四个任务。
3. `publish`：汇总 EXE、MSI、两个 DMG、DEB、AppImage 和 `SHA256SUMS.txt`，公开 GitHub Release。

下载页：

- [GitHub Releases](https://github.com/vito2088/ai-assistant/releases)

用户应下载安装包，而不是 `Source code`。安装包和 `SHA256SUMS.txt` 仅在 GitHub 发布；在 Gitee 阅读项目时，请使用 README 中的 GitHub 下载入口。`-beta.1` 等标签后缀会发布为预发布版本。

Windows 默认安装文件夹为英文 `my-assistant`，EXE 使用 `%LOCALAPPDATA%\my-assistant`，MSI 使用 `%ProgramFiles%\my-assistant`。升级安装保留已有路径；安装模板及维护说明见 [Windows 安装目录](../src-tauri/installer/README.md)。修改安装配置后需要发布新版本安装包，已经发布的旧安装包不会自动改变。

## 四、失败处理

| 情况 | 处理 |
| --- | --- |
| `check` 报版本不一致 | 同步六处版本值，修复后创建新版本标签 |
| 某平台编译失败 | 查看该 `build` 日志；网络故障可 Re-run failed jobs，源码问题修复后发新版本 |
| 附件上传中断 | 在 Actions 重跑失败任务；检查 Release 草稿及附件是否齐全 |

旧标签对应的历史工作流保留在 Git 历史中，不要重跑其中的 Gitee 同步任务；后续发布使用已移除同步的新版流程。

## 五、当前平台说明

跨平台构建成功不等于完成实机验证。macOS/Linux 功能仍需对应系统测试；Windows 尚无代码签名，macOS 目前为 ad-hoc 签名、未公证。详情见 [GitHub 发布配置](github-releases.md) 和 [Gitee 源码镜像说明](gitee-releases.md)。
