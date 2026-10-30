# 小助手 v0.2.1

发布日期：2026-10-30。

## 下载与安装

在本页 **Assets** 中选择安装包；`Source code` 是源码。

| 系统 | 安装包 |
| --- | --- |
| Windows x64 | `my-assistant_0.2.1_windows_x64-setup.exe`（推荐）或 `my-assistant_0.2.1_windows_x64.msi` |
| macOS Apple Silicon | `my-assistant_0.2.1_macos_aarch64.dmg` |
| macOS Intel | `my-assistant_0.2.1_macos_x64.dmg` |
| Linux x64 | `my-assistant_0.2.1_linux_x86_64.AppImage` 或 `my-assistant_0.2.1_linux_amd64.deb` |

附件提供 `SHA256SUMS.txt` 校验清单。安装包仅在 [GitHub Releases](https://github.com/vito2088/ai-assistant/releases/latest) 提供，Gitee 仓库仅同步源码与版本标签。

## 本版更新

- **AI 联系人与协作**：支持接入模型 API、Codex CLI 和 Claude Code，提供私聊、群组、@ 分工、依赖任务及参与者消息筛选；可为联系人分别设置文件、命令、应用及桌面工具权限。CLI 联系人需要本机安装并完成相应配置。
- **模型设置**：增加主 AI 选择，用于翻译等单模型场景；联系人保留独立绑定。完善智谱普通接口与 Coding Plan 配置、连通测试和模型获取交互，未获取模型列表时不显示下拉箭头。
- **终端与 SSH**：新增本地 PowerShell / CMD / 系统 Shell 交互终端、多个连接与子会话、SSH 密码或私钥认证、主机指纹确认，以及 SFTP 文件浏览、上传、下载和管理。终端中的 AI 可在确认后通过独立通道执行命令、读取文件，登录密码不作为 AI 工具参数传入。
- **会话操作**：新建本地终端后自动打开、选中并聚焦；第一个子会话也会显示。优化二级侧栏宽度、按钮图标、边框、关闭按钮和悬浮菜单，菜单不会撑开或被列表裁切。
- **导航与界面**：统一左右栏目及设置二级导航，默认窗口居中并支持调整大小；添加项目、应用改为软件内弹窗，确认操作使用软件内对话框。增加恢复默认设置、关于信息及 GitHub 仓库入口，精简底部文字。
- **截图与录屏**：统一工具栏、文字识别面板及按钮样式，修正鼠标进入工具按钮后仍显示十字光标的问题，保留 Windows 原生框选、标注、保存、复制、贴图、离线 OCR、AI 翻译及区域录屏。
- **安装体验**：Windows 默认安装目录使用英文 `my-assistant`，修复安装图标；EXE 安装器的桌面快捷方式名称随所选中文或英文切换，MSI 当前使用中文名称。
- **仓库迁移**：GitHub 地址更新为 `vito2088/ai-assistant`，安装包通过 GitHub 发布，Gitee 保留源码镜像。

原有待办、速记、电脑档案、项目与应用启动、计算器、提醒、开机启动及桌面置顶功能继续保留。

## 平台与验证

本地验证包含 81 项前端测试、79 项 Rust 测试和 13 个 Windows 安装快捷方式场景，以及前端构建和版本一致性检查。发布流程分别构建 Windows x64、macOS Apple Silicon、macOS Intel 和 Linux x64 安装包。

Windows 原生捕获已在本机验证；macOS / Linux 的系统捕获适配、安装与权限仍需在对应设备实测。录屏暂不包含声音。SSH 面向 Linux / POSIX Shell；终端 AI 操作需要确认，命令按当前账号权限执行，不是操作系统沙箱。

Windows 安装包尚未配置代码签名；macOS 使用 ad-hoc 签名，尚无 Developer ID 公证。
