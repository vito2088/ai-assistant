# Gitee 发行版同步

更新日期：2026-10-23

## 支持能力与方案

Gitee 支持发行版、附件上传与下载；Gitee Go 也有 [官方 Release 插件](https://help.gitee.com/enterprise/pipeline/plugin/gitee-release)。本项目采用 **GitHub Actions 构建一次 → 发布 GitHub → 同步相同安装包到 Gitee**，避免维护第二套跨平台编译环境。

Gitee 不会执行仓库里的 `.github/workflows`。因此仅推代码或标签到 Gitee 不会运行本项目的构建流程；GitHub 的标签推送负责启动构建，同步由 GitHub 上的 `sync-gitee` 任务执行。

## 配置文件

- `.github/workflows/release.yml`：发布后自动同步；`workflow_dispatch` 支持指定旧标签补同步。
- `scripts/gitee-release.mjs`：核对标签提交、校验本地安装包、调用 Gitee API 创建/更新发行版、上传附件。
- GitHub Repository secret `GITEE_TOKEN`：有 projects 权限且有仓库发布权限的 Gitee 私人令牌。
- 目标仓库固定为 `maoxiaoquan/my-assistant`，下载页为 https://gitee.com/maoxiaoquan/my-assistant/releases 。

完整日常提交、版本发布、首次令牌配置和补同步操作见 [代码推送与安装包发布](releasing.md)。

## 本机运行同步脚本

需要 Node.js 22、Git，并在本地拥有对应标签。准备一个文件夹，包含从同一 GitHub Release 下载的所有安装包和 `SHA256SUMS.txt`；目录不能混入其他版本安装包。

将 `GITEE_TOKEN` 通过安全方式设置为当前终端环境变量，不写入仓库文件或命令历史。然后运行：

```powershell
$env:RELEASE_TAG='v0.1.0'
$env:RELEASE_ASSETS_DIR='D:\releases\v0.1.0'
$env:RELEASE_NOTES_FILE='docs/release-notes.md'
node scripts/gitee-release.mjs
```

为旧版本同步时，`RELEASE_NOTES_FILE` 应指向该版本 GitHub Release 的说明，而不是后续版本的说明。自动流程会直接获取源 Release 正文。

## 可靠性与边界

- GitHub、Gitee 必须有指向同一 commit 的标签；不存在时直接失败，不替用户生成指向默认分支的错误标签。
- 本地附件必须匹配 SHA-256 清单；缺少、损坏或多余安装包会失败。
- 同步重跑时按文件名、大小及远端文件 SHA-256 核验，完全相同则跳过；不删除或覆盖已有附件。
- 每次上传后重新读取远端附件列表验证文件名和大小。校验文件最后上传，全部通过才写最终说明。
- Gitee API 无草稿字段，新版本上传阶段会标记为预发布并注明未完成。同步失败可重跑；GitHub Release 不受影响。
- 请求日志不输出令牌、认证响应正文或带令牌的 URL；附件 CDN 下载不携带 API 凭据。
- API 单文件大小、仓库容量和权限以 Gitee 当前限制为准；遇到限制会明确失败，不宣称同步成功。

接口依据 [Gitee OpenAPI v5](https://gitee.com/api/v5/swagger)（创建/更新 Release、列出/上传附件）。当前自动化测试验证校验失败、首次同步、重复同步及认证错误；实际上传仍依赖有效令牌和成功生成的安装包。
