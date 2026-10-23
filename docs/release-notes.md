## 下载与安装

在本页 **Assets** 中选择对应系统的安装包；`Source code` 是源代码，不是安装包。

| 系统 | 下载文件 |
| --- | --- |
| Windows x64 | `x64-setup.exe`（推荐）或 `.msi` |
| macOS Apple Silicon（M 系列） | `aarch64.dmg` |
| macOS Intel | `x64.dmg` |
| Linux x64 | `.AppImage` 或 `.deb` |

`SHA256SUMS.txt` 提供安装包校验值。

## 本版功能

- 文档：待办与速记，支持紧凑待办列表。
- 工作台：电脑档案、项目与编辑器入口、常用应用启动。
- 工具：计算器、截图标注、区域录屏、桌面贴图及待保存结果。
- 设置：开机启动、固定置顶、捕获保存目录、树形功能显示开关。
- 截图、录屏与贴图操作统一为浅色图标工具栏。

## 平台说明

Windows 的原生截图与区域录屏已在开发环境验证；macOS/Linux 的安装、桌面行为及 WebView 屏幕捕获仍需对应系统实测。当前录屏无声音。

Windows 安装包尚未配置代码签名，系统可能提示未知发布者；macOS 目前仅使用 ad-hoc 签名，没有 Apple Developer ID 签名及公证，Gatekeeper 可能拦截首次打开。后续正式分发需配置对应签名与公证。
