# Gitee 源码镜像与下载指引

更新日期：2026-10-30

Gitee 仓库仅同步源码，安装包统一在 GitHub 发布和下载。

**[前往 GitHub 下载最新安装包](https://github.com/vito2088/ai-assistant/releases/latest)**。在版本页的 **Assets** 中选择系统对应的 EXE、MSI、DMG、DEB 或 AppImage，校验值见同页的 `SHA256SUMS.txt`。

## 维护方式

- 日常源码仍推送 `origin-gitee main` 和 `origin-github main`。
- 版本标签可同时归档到两个仓库，只有向 GitHub 推送 `v*` 标签会触发安装包构建。
- 已移除 Gitee 安装包上传脚本、自动同步任务和手动补同步入口。发布完成后不再调用 Gitee 发行版 API。
- 中英文 README 及发布说明均引导至 GitHub 下载，不再提供 Gitee 安装包下载入口。
- 独立的默认分支维护工作流与发布解耦；发布安装包不需要 `GITEE_TOKEN`。

完整提交和发布命令见 [代码推送与安装包发布](releasing.md)。既有远程历史发行版及附件不会因删除本地同步脚本自动移除，旧标签中的历史同步任务也不应再重跑。
