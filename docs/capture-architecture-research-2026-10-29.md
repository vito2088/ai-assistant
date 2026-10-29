# 截图与录屏性能、架构调研

日期：2026-10-29。状态：调研结论及建议，原生方案尚未实现或做性能对照。

后续已增加 Windows 原生快速截图试用，进展与验证见 [原型 v0.1](native-capture-prototype-v0.1.md)。下文保留调研时的选型依据。

关联：[捕获启动 v0.3](capture-startup-v0.3.md)、[窗口复用 v0.4](capture-startup-v0.4.md)。

## 结论

建议继续使用 Tauri 2 + Rust + Web UI 开发助手主界面，将截图、录屏选区和标注设计为独立的 Rust 原生模块。Windows 先用 Win32 窗口和 Direct2D 做小范围原型，验证效果后再迁移完整编辑功能。保留跨平台接口，共用编辑数据和操作逻辑，各平台分别处理捕获、窗口和权限。

这是根据当前代码与公开文档作出的工程判断，不是已经测得“原生一定更快”的结果。原生绘制能省去当前路径中的一些步骤，也能更直接控制首帧，但仍需要处理显卡、DPI、HDR、焦点和系统合成；不能以框架名称保证绝不闪屏。

## 微信能确认什么

本次检索没有找到足以说明微信当前 Windows/macOS 截图完整架构的腾讯官方源码或技术说明。因此无法确认其是否常驻捕获窗口、是否采用特定取屏 API，也无法确认不同版本采用同一种实现。

第三方调用截图 DLL 的示例，以及外观类似微信的开源项目，不能证明微信当前版本的内部实现。“像微信一样流畅”可以作为体验目标，不能作为特定技术方案的证据。

可核查的开源参考是 Flameshot：捕获编辑器继承 QWidget，使用 QPainter 绘制截图和编辑内容。这证明原生绘制是实际存在的实现路线，但不代表微信采用同样技术，也不是两个产品的性能对比。[源码](https://github.com/flameshot-org/flameshot/blob/master/src/widgets/capture/capturewidget.cpp)

## 当前项目实际经过的步骤

Windows 的选区启动目前为：

```text
快捷键 → 主界面处理 → Rust/GDI 取屏 → BGRA 转 RGBA
      → PNG 编码 → 临时文件 → IPC 读取 → WebView 解码
      → Canvas 绘制 → 提交画面 → 恢复交互
```

对应代码为 `desktop_snapshot.rs`、`tools.ts` 和 `capture-overlay.ts`。v0.4 已预热并复用窗口，减少创建和显隐造成的首帧问题；PNG 中转和浏览器绘制仍存在。这里有可优化的步骤，但仅凭调用链不能确定每一步在当前设备上的实际耗时比例。

录屏是另一条路径：现在已经使用 Windows Graphics Capture 和 H.264 编码，并不通过 PNG 逐帧录制。现有帧处理仍有 CPU 缓冲、裁剪和行翻转，不能称为全 GPU 零拷贝编码。取屏 API、编辑界面、视频编码应分别测量和优化。

## 方案比较

以下评价是针对本项目的相对工程成本与预期，均非同机性能测量结果。

| 路线 | 优点 | 主要代价 | 适用判断 |
| --- | --- | --- | --- |
| 继续优化当前 WebView | 最大程度复用全部工具、样式、OCR 和保存逻辑 | 保留浏览器环境及图片传输、解码；首帧受系统 WebView 影响 | 适合作为当前可用版本和后备实现 |
| Tauri 主界面 + Rust 原生捕获界面 | 可直接使用内存图像，控制窗口首帧；捕获层无需额外 WebView | 选区、标注、文字输入、工具条需要迁移；平台窗口适配工作较多 | 本项目性能优先时的首选验证方向 |
| Tauri + egui/wgpu 等 Rust 绘制组件 | 可共用较多绘制与编辑代码，便于统一多端交互 | 需要事件循环、窗口、GPU 和输入法集成，并不是添加一个依赖即可完成 | 多端需求扩大后值得对照验证 |
| 独立 Qt/Flameshot 类组件或工具 | 有成熟编辑交互可参考，外部工具接入也较快 | 增加另一套运行库或安装依赖，样式、数据和打包整合成本上升 | 可用于原型或可选外部工具入口 |
| 调用各系统截图工具 | 自己维护的捕获界面较少 | 交互、标注和回调受系统版本与协议约束，难保持统一体验 | 适合作为降级或兼容路径 |

Direct2D 是微软的硬件加速二维图形 API，支持位图、图形和文字，并可与 GDI/Direct3D 配合。这使其适合验证 Windows 原生捕获编辑器；并不要求立即把静态取屏也更换成 DXGI。[官方说明](https://learn.microsoft.com/en-us/windows/win32/direct2d/direct2d-portal)

Electron 也采用 Chromium 多进程架构。更换为 Electron 本身不会自动省掉截图的编码、传输和浏览器绘制步骤；目前缺少值得重写整个助手的对照证据。[官方说明](https://github.com/electron/electron/blob/main/docs/tutorial/process-model.md)

## 组件调研与边界

- **xcap**：Rust 跨平台取屏库，可作为静态截图后端候选；项目把录屏标为 WIP，Wayland 有支持限制。它不提供完整的框选、标注和工具条。仓库标注 Apache-2.0，选型时应固定并测试具体发行版本，不能把 master 状态当成已发布能力。[项目说明](https://github.com/nashaofu/xcap)
- **scap**：使用各系统原生 API 提供视频帧捕获，列出 Windows Graphics Capture、macOS ScreenCaptureKit 和 Linux PipeWire。可作为后续统一录屏后端候选，但仍需编码、音频、保存和编辑界面；仅替换它不能解决选区窗口首帧。项目标注 MIT。[项目说明](https://github.com/CapSoftware/scap)
- **egui**：提供 Rust 控件及绘制能力，支持与现有引擎集成；项目说明其可按交互或动画请求重绘。采用它时必须验证中文输入、字体、GPU 初始化和与 Tauri 的集成成本。项目标注 MIT OR Apache-2.0。[项目说明](https://github.com/emilk/egui)
- **Slint**：可作为独立原生界面候选，但它也有多种渲染后端，并非选择 Slint 就自动得到最小占用。Skia 的磁盘体积较大，软件后端的文字和绘制能力有自己的限制；具体渲染器及中文标注需验证。其桌面免费许可有署名条件，也提供其他许可路径。[渲染后端](https://docs.slint.dev/latest/docs/slint/guide/backends-and-renderers/backends_and_renderers/)、[官方许可说明](https://slint.dev/get-started)
- **Flameshot**：可参考 Qt 编辑器的交互和源码组织，也可作为外部工具候选。项目使用 GPL-3.0；当前助手为 AGPL-3.0，引入时需逐项记录所用代码、第三方依赖和许可，不能把它当成一个无依赖的 Rust 控件。[仓库及许可](https://github.com/flameshot-org/flameshot)

特别注意：`eframe` 的默认集成包含自己的窗口事件循环。winit 为跨平台兼容要求主线程创建事件循环，且每个应用只能创建一次。因此不能直接在现有 Tauri 进程的任意线程调用 `eframe::run_native`，就认为完成了跨平台集成。应验证与现有窗口/渲染的适配，或评估独立辅助进程及其冷启动、IPC 成本。[winit 文档](https://docs.rs/winit/latest/src/winit/event_loop.rs.html)

## 跨平台安排

| 平台 | 建议的取屏/录屏路径 | 界面与权限需要单独处理的部分 |
| --- | --- | --- |
| Windows | 静态截图先复用 GDI，录屏先保留 WGC；DXGI 作为后续对照候选 | Win32/Direct2D 原生窗口、混合 DPI、多显示器、焦点、HDR 与捕获排除 |
| macOS | 评估 ScreenCaptureKit；根据最低支持版本选择单帧或流式接口 | AppKit 窗口、屏幕录制授权、Retina 坐标与显示器变化 |
| Linux X11 | 评估 xcap 等后端，编辑模型和渲染代码尽量共用 | 桌面窗口管理器、缩放、剪贴板和快捷键 |
| Linux Wayland | Screenshot portal；录屏使用 ScreenCast portal / PipeWire | 受合成器和门户能力约束，系统授权和选择流程需要保留，不能承诺与 Windows 完全一致 |

参考：[Apple 捕获示例](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos)、[Screenshot portal](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Screenshot.html)、[ScreenCast portal](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.ScreenCast.html)。

Windows 系统截图工具集成也有打包约束：微软当前文档中的新 `ms-screenclip` 回调协议要求 MSIX 包身份，并通过指定启动方式传递身份；不能把现有 MSI/NSIS 安装包视为已具备该回调能力。因此系统工具方案不是当前项目的直接等价替换。[微软协议说明](https://learn.microsoft.com/en-us/windows/apps/develop/launch/launch-snipping-tool)

## 推荐的后续验证顺序

1. 先记录当前发行构建的基线，分别测量取屏、编码/传输、解码、首帧和可交互时间。现有 v0.4 的 753–965 毫秒是开发版调试观测，不用于断定发行版性能或微信的实现。
2. 做 Windows 原生小原型：同一显示器、同一 GDI 输入，直接把内存位图交给原生绘制层，只实现冻结底图、框选、Esc 和复制。唤起阶段不生成 PNG、不落盘、不把整张底图传入 JavaScript；复制、保存和导出时才编码。
3. 对照结果确有收益，再迁移画笔、箭头、文字、马赛克、撤销、保存、贴图和 OCR。编辑命令和几何模型保持 Rust 可复用接口，不直接绑定 Win32。
4. 为 macOS/Linux 接入平台后端。若多端绘制维护成本明显上升，再以同样基准比较 egui/wgpu 原型；避免同时改捕获 API、窗口框架和视频编码，造成无法归因。

性能验证至少覆盖冷/热启动、1080p/4K、单/双屏与不同缩放；统计响应分布而非只报最快一次。连续捕获后检查内存是否回落、句柄是否增长、焦点是否归还，并观察真实屏幕是否闪动。测试记录需区分开发/发行构建和测试设备；此时不承诺具体内存或毫秒数。

一张 3840 × 2160 的 32 位底图本身为 33,177,600 字节，约 31.6 MiB；纹理、临时缓冲和编辑资源另计。原生方案能减少特定中转与运行环境，并不意味着无需图像内存或持续保持录屏资源。空闲时应释放图像和录制资源，仅保留必要的窗口/设备句柄；GPU 设备是否保留，以启动耗时和实测占用决定。

本次只形成调研与演进建议，未替换现有捕获实现。
