# 桌面小助手｜跨平台技术方案 v0.3

- 状态：建议方案，尚未开发和实测
- 日期：2026-10-23
- 平台假设：Windows、macOS、Linux 桌面系统
- 上一版：[技术选型比较 v0.2](technical-choice-v0.2.md)
- 产品需求：[产品总览 v0.5](product-overview-v0.5.md)

## 1. 结论

目标改为三种桌面系统后，Windows 专用的 WPF 不再作为主方案。**综合推荐 Tauri 2 + Rust 后端 + 轻量 Web 前端 + SQLite**：它有跨平台窗口和托盘能力，Rust 处理本地数据与启动外部程序；界面通过各系统 WebView 显示。若经过原型测量后仍希望降低常驻资源占用，再评估 **Rust + Slint** 的原生界面路线。

推荐 Tauri 是对交付速度、跨平台系统能力与资源占用的综合工程判断，不是“必然比其他方案快”的基准测试结论。

## 2. 三条路线

| 方案 | 适合点 | 对本产品的主要代价 |
| --- | --- | --- |
| **Tauri 2 + Rust + Web UI（推荐）** | Windows、macOS、Linux；窗口、托盘与本地后端有成体系的支持 | 仍使用 WebView；需要控制前端依赖、窗口数量和后台活动 |
| Rust + Slint | 三平台原生 UI，适合把常驻资源占用放在首位 | 托盘、置顶、应用入口等系统功能需要更多平台适配工作；发布许可需核对 |
| Electron | Web 团队上手快、生态成熟 | 携带 Chromium/Node.js，采用多进程架构；常驻资源要重点测量 |

Tauri 不是纯原生 Rust 界面：Windows 使用 WebView2，macOS 使用 WKWebView，Linux 使用 WebKitGTK。Slint 则是独立的跨平台 GUI 框架。无论哪种方案，Linux 的窗口管理限制都不能仅靠换框架消除。

## 3. 功能如何跨平台

```text
共享功能层
  ├─ 待办、项目、软件入口的数据模型和 SQLite 存储
  ├─ 三个功能页、桌面小图标和单条待办的交互
  └─ 统一的错误提示与设置

平台适配层
  ├─ 窗口位置、固定置顶、最小化、托盘
  ├─ 选择项目文件夹
  ├─ 枚举或添加可启动软件
  └─ 用指定编辑器打开项目、启动软件
```

- **项目管理**：统一保存“项目名称＋本机项目路径＋编辑器”，各系统分别解析编辑器入口并启动。保存的路径通常只在当前设备有效，不在不同系统间直接复用。
- **软件管理**：各系统的软件安装和启动方式不同。首版优先支持用户手动选择可启动入口；“自动列出已安装软件”作为平台适配能力逐步加入。
- **待办**：数据逻辑可共用；桌面小图标、托盘与置顶需分别验证。
- **打包发布**：为 Windows、macOS、Linux 分别构建、测试和打包，不能把一个安装包通用于三者。

## 4. 固定与 Linux Wayland 限制

“固定”仍表示锁定用户选定的位置，并尽可能保持在普通窗口之上。Windows 和 macOS 可按各自窗口系统实现。Linux X11 的效果还受窗口管理器影响；Wayland 不提供通用的全局窗口坐标控制和普通置顶保证。因此：

1. 在平台支持时，提供完整的“锁定位置＋置顶”。
2. 在不支持的平台环境，界面明确告知哪一部分不可用，不显示虚假的成功状态。
3. 如果以后要把 Wayland 的完整桌面固定视为硬需求，再单独评估特定桌面环境的扩展协议；不能承诺所有发行版和桌面环境一致。

这个限制对 Tauri、Slint 和 Electron 都需要考虑。托盘在 Linux 不同桌面环境下也应实测交互。

## 5. 性能验证

先实现同一个小原型：小图标悬停菜单、展开/收起、托盘恢复、固定置顶和 100 条待办。分别在 Windows、macOS、Linux X11 与 Wayland 上验证功能；在目标设备上记录冷启动、空闲 CPU、稳定内存、拖动和切换响应。当前不写未经测量的内存或毫秒承诺。

前端保持单窗口、少动画、无空闲轮询；图标读取和软件扫描不要阻塞界面。若 Tauri 原型未达到目标，再用相同场景比较 Slint，而不是直接推断任何框架必然卡顿。

## 6. 官方资料

- [Tauri 架构](https://v2.tauri.app/concept/architecture/)
- [Tauri 各平台 WebView](https://v2.tauri.app/reference/webview-versions/)
- [Tauri 系统托盘](https://v2.tauri.app/learn/system-tray/)
- [Slint 跨平台桌面支持](https://docs.slint.dev/latest/docs/slint/guide/backends-and-renderers/backend_winit/)
- [Tauri 底层窗口库 Tao 的平台限制](https://docs.rs/tao/latest/tao/window/struct.Window.html)
- [Electron 窗口 API 的 Wayland 限制](https://www.electronjs.org/docs/latest/api/browser-window)
