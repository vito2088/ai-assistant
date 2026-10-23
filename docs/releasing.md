# 代码推送与安装包发布

更新日期：2026-10-23

本项目的开发分支是 `master`，两个远程仓库分别是：

| 远程名 | 用途 | 地址 |
| --- | --- | --- |
| `origin-github` | 源码、跨平台构建、安装包发布 | https://github.com/maoxiaoquan/my-assistant |
| `origin-gitee` | 源码、国内安装包下载 | https://gitee.com/maoxiaoquan/my-assistant |

## 一、日常提交代码（不发布软件）

在项目根目录执行：

```powershell
git status
npm test
npm run build
git add README.md src docs
git diff --cached --stat
git commit -m "feat: 描述本次功能"
git push origin-gitee master
git push origin-github master
```

`git add` 中的路径按本次修改填写。例如改了 Rust 或发布流程，需要额外加入 `src-tauri`、`.github`、`scripts`、`package.json` 等对应文件。不要加入 `node_modules`、`dist`、`target`、个人数据或令牌。只有一个远程推送成功时，另一个可单独重试；不需要再次提交。

**普通分支推送只更新代码。推送版本标签才会触发安装包构建。**

## 二、首次准备

1. GitHub 与 Gitee 仓库都应允许当前账号推送。面向公众提供下载需要公开仓库。
2. GitHub 开启 Actions，允许项目流程使用的 actions。跨平台构建使用 GitHub 托管运行器，无需本机同时安装三种系统。
3. 在 Gitee [私人令牌设置](https://gitee.com/profile/personal_access_tokens) 创建具有 **projects** 权限的令牌，账号需有目标仓库发布权限。
4. 到 [GitHub Actions secrets](https://github.com/maoxiaoquan/my-assistant/settings/secrets/actions) → **New repository secret**，名称填写 `GITEE_TOKEN`，值填写令牌。不要放到 Variables、源码、文档或聊天里。令牌过期后更新同名 secret。
5. 当前实际代码位于 `master`。若 GitHub 默认分支仍为 `main`，在仓库 **Settings → General → Default branch** 改为 `master`，或将完整代码合并到默认分支；否则首页可能显示旧代码，手动 **Run workflow** 按钮也可能不出现。本项目文档以下以 `master` 为准。

GitHub 发布使用内置 `GITHUB_TOKEN`；Gitee 使用 `GITEE_TOKEN`。两者不能互换。现有 Git 登录密码能推送代码，并不代表它能调用 Gitee 发行版 API。

## 三、发布新版本（例如 v0.1.1）

### 1. 更新版本号与发布说明

以下版本必须全部一致：

- `package.json` 的 `version`
- `package-lock.json` 的顶层版本和 `packages[""].version`
- `src-tauri/tauri.conf.json` 的 `version`
- `src-tauri/Cargo.toml` 的 `[package].version`
- `src-tauri/Cargo.lock` 中 `my-assistant` 包的版本

Node 部分可以运行 `npm version 0.1.1 --no-git-tag-version` 同步两个 JSON 文件；再修改 Tauri/Cargo 版本，并运行 `cargo check --manifest-path src-tauri/Cargo.toml` 更新锁文件。更新 `docs/release-notes.md`，只写本版变更和适用说明。

```powershell
$env:RELEASE_TAG='v0.1.1'
node scripts/check-release.mjs
npm test
npm run build
cargo check --locked --manifest-path src-tauri/Cargo.toml
```

### 2. 提交，先同步代码，再同步标签

```powershell
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/tauri.conf.json docs/release-notes.md
git commit -m "chore: release v0.1.1"
git push origin-gitee master
git push origin-github master
git tag -a v0.1.1 -m "Release v0.1.1"
git push origin-gitee v0.1.1
git push origin-github v0.1.1
```

每条命令成功后再执行下一条。其他功能修改应在发版前提交。标签只能创建一次；两边推送同一个本地标签，确保源码一致。**先推 Gitee 标签，再推 GitHub 标签**，这样自动同步时 Gitee 已有对应提交。不要修改或强推已公开版本标签，修复后递增版本号再发布。

### 3. 查看发布结果

[GitHub Actions → Release installers](https://github.com/maoxiaoquan/my-assistant/actions/workflows/release.yml) 执行：

1. `check`：版本一致性、测试、前端构建。
2. `build`：Windows x64、macOS ARM64、macOS Intel、Linux x64 四个任务。
3. `publish`：汇总 EXE、MSI、两个 DMG、DEB、AppImage 和 `SHA256SUMS.txt`，公开 GitHub Release。
4. `sync-gitee`：下载已发布附件，检查校验和与 Gitee 标签，上传 Gitee 并更新说明。

下载页：

- [GitHub Releases](https://github.com/maoxiaoquan/my-assistant/releases)
- [Gitee 发行版](https://gitee.com/maoxiaoquan/my-assistant/releases)

用户应下载安装包，而不是 `Source code`。两边的二进制与校验值相同。`-beta.1` 等标签后缀会发布为预发布版本。

## 四、补同步已有版本到 Gitee

适用于本次 `v0.1.0`：最初的标签流程没有 Gitee 同步步骤，**更新 master 不会改变已运行的标签流程**，因此首次需要补同步。

先确保 GitHub Release 已发布成功、两边源码和标签相同，并配置 `GITEE_TOKEN`：

```powershell
git push origin-gitee master
git push origin-gitee v0.1.0
```

进入 Actions → Release installers → **Run workflow**，分支选择包含最新同步脚本的 `master`，`tag` 填 `v0.1.0`，执行。手动运行只下载已有 GitHub Release 并同步到 Gitee，不重新构建，不重发 GitHub Release。按钮不可见时检查默认分支设置，见“首次准备”。

也可在安装了 GitHub CLI 并登录后运行：

```powershell
gh workflow run release.yml --repo maoxiaoquan/my-assistant --ref master -f tag=v0.1.0
```

## 五、失败处理

| 情况 | 处理 |
| --- | --- |
| `check` 报版本不一致 | 同步六处版本值，修复后创建新版本标签 |
| 某平台编译失败 | 查看该 `build` 日志；网络故障可 Re-run failed jobs，源码问题修复后发新版本 |
| GitHub 已发布，Gitee 同步失败 | GitHub 下载仍有效；修正配置后按“补同步已有版本”重试 |
| 缺少 `GITEE_TOKEN` / HTTP 401、403 | 检查 secret 名称、令牌有效期、projects 权限与仓库权限 |
| Gitee 标签缺失或提交不同 | 推送正确标签；有冲突时先人工检查，不强行覆盖 |
| Gitee 附件大小或内容不一致 | 脚本会拒绝覆盖；检查版本来源，优先发布新版本 |
| Gitee 上传中断或附件限制 | 查看 HTTP 错误，检查平台限制；重试会核验并跳过相同附件 |

Gitee 的 API 没有 GitHub 那样的草稿发布字段。首次同步期间会临时标记为预发布，并在说明中提示“正在同步”；全部附件检查通过后才更新正式说明和预发布状态。因此同步未完成时请使用 GitHub 下载。

## 六、当前平台说明

跨平台构建成功不等于完成实机验证。macOS/Linux 功能仍需对应系统测试；Windows 尚无代码签名，macOS 目前为 ad-hoc 签名、未公证。详情见 [GitHub 发布配置](github-releases.md) 和 [Gitee 同步配置](gitee-releases.md)。
