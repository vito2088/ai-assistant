# 桌面小助手｜技术选型与性能方案 v0.1

- 状态：建议方案，尚未开发和实测
- 日期：2026-10-23
- 适用范围：Windows 桌面待办、项目管理、软件管理
- 产品需求：[产品总览 v0.4](product-overview-v0.4.md)

## 1. 推荐方案

**C# + .NET 10 LTS + WPF** 构建桌面界面，**SQLite** 保存本地数据。窗口和系统交互优先使用 WPF 与 .NET 自带能力，确实需要时再调用少量 Win32 API。

理由：当前三个功能主要是小窗口显示、本地数据编辑、窗口层级和启动外部软件，不需要浏览器引擎或网络服务。WPF 的窗口属性直接支持位置与置顶；它有硬件渲染路径，也提供列表虚拟化等性能手段。.NET 10 是当前受支持的 LTS 版本。

这是一项面向 **Windows 优先、常驻时低占用、快速响应** 的选择；实际内存和启动速度必须通过原型测量，不以框架名称保证“绝不卡顿”。

## 2. 技术分层

```text
WPF 界面层
  ├─ 桌面小图标 / 悬停按钮 / 主窗口 / 单条待办卡片
  ├─ 待办页 / 项目页 / 软件页
  └─ 状态绑定与交互命令

应用服务层
  ├─ 窗口状态、位置和固定置顶
  ├─ 待办、项目、软件入口管理
  └─ 编辑器与软件启动

本地数据层
  ├─ SQLite：待办、项目、软件入口
  └─ 设置：窗口位置、显示状态、固定状态
```

- 界面与数据操作分开，便于后续增加第四个功能。
- 主界面、小图标和单条卡片共享一份状态，不为每种显示方式复制数据。
- 从托盘恢复、切换显示状态和固定置顶由同一窗口服务处理，避免各页面自行控制窗口造成状态不一致。

## 3. 关键实现选择

| 需求 | 建议实现 |
| --- | --- |
| 固定位置、普通窗口无法遮挡 | 保存窗口坐标；锁定拖动；设置 WPF `Topmost`。需遵守 Windows 对其他置顶窗口和系统界面的层级规则。 |
| 收起为桌面小图标 | 切换到小尺寸窗口；悬停时展示功能按钮；尽量复用主窗口和状态。 |
| 最小化后恢复 | 使用系统托盘入口；WPF 应用可集成 Windows Forms `NotifyIcon`。 |
| 一键打开项目 | 保存项目文件夹和编辑器路径或应用标识；通过 `ProcessStartInfo` 传入明确的程序和参数。 |
| 一键打开软件 | 保存可执行程序或系统应用入口；点击后由应用服务启动并处理失败。 |
| 本地保存 | 使用 `Microsoft.Data.Sqlite` 直接操作 SQLite；首版数据简单，暂不引入完整 ORM。 |
| 多屏与分辨率变化 | 保存显示器信息和窗口位置；恢复时检查可见区域，越界则移回屏幕内。 |

## 4. 防卡顿原则

1. **空闲时不持续刷新。** 没有动画或用户操作时，不运行高频定时器；悬停菜单只在状态改变时更新。
2. **保持 UI 线程轻。** 磁盘读写、扫描已安装软件、图标提取和进程启动的耗时步骤不在界面线程同步执行。
3. **按需加载。** 首次只加载当前页面需要的数据；软件图标异步加载并缓存，避免滚动时反复读取磁盘。
4. **列表虚拟化。** 待办、项目和软件列表增长后，只创建屏幕上可见的行；避免复杂嵌套和过度动画。
5. **谨慎使用透明效果。** 小图标与悬停面板可做适度透明，但先测量透明窗口、阴影与动画的实际成本；性能不达标时简化效果。
6. **写入合并。** 拖动时只更新界面位置，在拖动结束后保存；待办操作及时保存，但避免每个鼠标移动事件写库。
7. **不内置常驻 Web 服务。** 当前功能不需要本地 HTTP 服务、浏览器标签页或额外后台进程。

## 5. 性能验收方式

先做最小原型，再在目标电脑上测量。建议记录冷启动时间、空闲 CPU、稳定内存、展开/收起响应、拖动流畅度、列表滚动、从点击“打开”到系统收到启动请求的耗时。测试场景至少包括：空数据、数百条待办、数百个软件入口、双显示器、置顶状态和最小化后恢复。

性能指标应在原型测量基线后确定，避免在没有硬件信息时给出不可靠的内存或毫秒承诺。若某项超出目标，先用性能分析工具找到热点，再决定是否调整界面效果、数据加载方式或底层实现。

## 6. 方案对比

| 方案 | 适合点 | 对当前产品的取舍 |
| --- | --- | --- |
| **.NET 10 + WPF（推荐）** | Windows 窗口、托盘、本地程序启动和数据管理直接；开发与维护成本适中 | 仅面向 Windows；自定义透明小组件要实测渲染成本 |
| Rust + 原生 Win32 | 可以进一步控制运行时和窗口细节 | 界面与可维护性投入明显更高；当前功能规模暂不值得先承担 |
| Tauri + Web 前端 | 适合已有成熟 Web UI 团队和跨平台需求 | 多一层 WebView；当前更重视 Windows 常驻小窗口体验 |
| Electron | Web 技术开发速度快，跨平台生态成熟 | 内置 Chromium/Node.js 且采用多进程模型；对这个轻量常驻工具并非首选 |

这里的比较是基于产品需求的工程判断，不代表框架的统一性能排名。若后续明确要求 macOS/Linux，或团队只熟悉 Web 技术，应重新评估。

## 7. 决策与风险

| 项目 | 当前结论 |
| --- | --- |
| 目标平台 | 暂按 Windows 10/11；开发前确认最低系统版本 |
| 主要技术 | 建议 .NET 10 LTS + WPF |
| 本地存储 | 建议 SQLite |
| 最小化入口 | 建议系统托盘，仍待产品确认 |
| 固定置顶 | 可高于普通窗口；其他置顶窗口或系统界面仍按 Windows 规则处理 |
| 透明小图标 | 原型阶段验证性能与边缘交互，再确定视觉效果 |

## 8. 官方资料

- [.NET 支持策略与 .NET 10 LTS](https://dotnet.microsoft.com/en-us/platform/support/policy)
- [WPF 窗口位置与 Topmost](https://learn.microsoft.com/en-us/dotnet/desktop/wpf/windows/)
- [WPF 硬件与软件渲染](https://learn.microsoft.com/en-us/dotnet/desktop/wpf/advanced/optimizing-performance-taking-advantage-of-hardware)
- [WPF 控件性能与虚拟化](https://learn.microsoft.com/en-us/dotnet/desktop/wpf/advanced/optimizing-performance-controls)
- [Windows Forms NotifyIcon](https://learn.microsoft.com/en-us/dotnet/desktop/winforms/controls/notifyicon-component-overview-windows-forms)
- [ProcessStartInfo](https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.processstartinfo)
- [Microsoft.Data.Sqlite](https://learn.microsoft.com/en-us/dotnet/standard/data/sqlite/)
- [Electron 进程模型](https://www.electronjs.org/docs/latest/tutorial/process-model)
