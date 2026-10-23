# 桌面小助手｜技术选型比较 v0.2

- 状态：建议方案，尚未开发和实测
- 日期：2026-10-23
- 上一版：[技术选型与性能方案 v0.1](technical-design-v0.1.md)

## 结论

针对目前的 Windows 桌面待办、项目管理、软件管理三项功能：

1. **总体推荐：C# + .NET 10 + WPF。** Windows 窗口、置顶、托盘和本地程序启动更直接，开发成本与运行性能较平衡。
2. **如果明确希望用 Rust：Rust + Slint + 少量 Windows API。** 界面用 Slint，窗口层级、托盘和软件启动通过适配层接入 Windows。先做小图标及悬停菜单原型，测量实际占用与交互流畅度。
3. **Rust 与 Electron 二选一且性能优先：选 Rust 原生界面。** Electron 更适合已有 Web 前端团队、需要快速搭复杂界面或跨平台一致体验的情况。

这里的“性能优先”主要指常驻时 CPU/内存、启动速度和窗口操作响应；具体结果要在同一台目标电脑上实测，不能仅凭语言保证。

## Rust 路线

Rust 可以做这款软件的全部核心功能。Slint 提供桌面 UI、Windows 后端和多种渲染器；微软的 `windows-rs` 可以调用 Win32、COM 等 Windows API。因此固定置顶、窗口位置、托盘、程序启动等行为有实现路径。Rust 本身不会自动解决小图标透明窗口和多屏边缘布局，相关交互仍需做原型验证。

建议组合：

```text
Rust
├─ Slint：主界面、待办卡片、小图标与悬停菜单
├─ windows-rs / 适配库：置顶、托盘、窗口位置与系统事件
├─ SQLite：本地持久化
└─ std::process::Command / Windows API：启动编辑器和软件
```

开发取舍：Rust 原生方案可以避免内置浏览器 UI；但桌面 GUI 和 Windows 细节的集成工作通常比 WPF 多。Slint 的许可条件也应在决定开源或商业发布方式时核对。

## Electron 路线

Electron 用 HTML/CSS/JavaScript 做界面，现成的桌面窗口、托盘和跨平台能力较多。它会随应用携带 Chromium 和 Node.js，并采用主进程与渲染进程架构；对长期常驻的小助手，这意味着需要认真管理内存、窗口数量和后台工作。不能据此断言它一定卡顿，最终仍要实测。

如果团队已经非常熟悉 Web 技术、需要尽快做复杂视觉界面，Electron 可以缩短开发时间。但本产品首版界面较小，本地系统交互较多，因此目前不推荐它作为第一选择。

## 不要混淆 Rust 与 Tauri

Tauri 的后端是 Rust，但前端仍通过 WebView 渲染；Windows 上使用 WebView2。若目的是尽量减少常驻 UI 的浏览器组件，应比较 **Rust + Slint** 与 Electron，而不是把 Tauri 当作纯原生 Rust UI。Tauri 可以作为追求 Web 开发效率和较小安装包的折中方案。

## 三种方案简表

| 方案 | 常驻资源潜力 | Windows 功能实现 | 开发速度 | 当前建议 |
| --- | --- | --- | --- | --- |
| WPF + .NET | 较好，需控制透明效果和列表复杂度 | 最直接 | 较快 | 首选 |
| Rust + Slint | 有进一步压低占用的潜力，需实测 | 需要 Windows API 适配 | 较慢 | 性能极优先或偏好 Rust 时选 |
| Electron | 需要承担 Chromium/Node.js 与多进程开销 | 框架已有较多能力 | Web 团队较快 | 当前不优先 |

表格是架构层面的工程判断，不是基准测试结果。

## 下一步验证

若要在 WPF 与 Rust 间最终定案，先分别做同一个最小原型：小图标悬停菜单、展开/收起、固定置顶、托盘恢复和 100 条待办。用同一台电脑测量冷启动、空闲内存、空闲 CPU、拖动帧率与交互延迟，再结合开发投入决定。项目和软件的一键启动可在原型第二阶段验证。

## 官方资料

- [Slint Windows 后端与渲染器](https://docs.slint.dev/latest/docs/slint/guide/backends-and-renderers/backend_winit/)
- [Slint 许可说明](https://slint.dev/faqs)
- [微软 windows-rs API](https://github.com/microsoft/windows-rs/blob/master/docs/crates/windows.md)
- [Electron 进程模型](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Electron 架构说明](https://www.electronjs.org/docs/latest)
- [Tauri Windows WebView2](https://v2.tauri.app/reference/webview-versions/)
- [WPF 窗口与置顶](https://learn.microsoft.com/en-us/dotnet/desktop/wpf/windows/)
