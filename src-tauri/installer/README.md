# Windows 安装目录

EXE / MSI 新安装时，默认文件夹统一为英文 `my-assistant`：

- NSIS EXE（当前用户）：`%LOCALAPPDATA%\my-assistant`
- WiX MSI（所有用户）：`%ProgramFiles%\my-assistant`

只修改应用文件夹，不修改 Windows 用户目录等系统路径。产品身份和开始菜单名称仍为“桌面小助手”；EXE 安装器的桌面快捷方式名称跟随所选安装语言。

## 桌面快捷方式语言

| EXE 安装器所选语言 | 桌面图标下的名称 |
| --- | --- |
| 简体中文 | 桌面小助手 |
| English | Desktop Assistant |

`localized-shortcuts.nsh` 以 NSIS `LangString` 获取安装语言；在安装阶段和完成页创建快捷方式，不在语言尚未初始化完成的 `.onInit` 中解析名称。安装目录和 EXE 文件名始终为英文，不随语言变化。MSI 当前仅构建中文包，没有运行时语言选择框，桌面快捷方式仍为中文。

切换安装语言升级时，已有桌面快捷方式迁移为对应语言；先成功创建新链接，再清理旧语言链接，防止重复图标。用户原先没有桌面快捷方式时，升级或 `/NS` 模式不会额外创建。遇到同名但指向其他程序的链接时不覆盖、不删除。卸载检查中英文两种名称，只删除指向当前安装目录中应用的链接。应用内部语言仍按现有设置独立保存。

升级安装沿用已有安装位置（包括旧的中文目录和用户自选目录），避免重复安装；需要改位置时可在安装向导中选择。产品名、注册表键和应用 identifier 保持不变。`tauri.windows.conf.json` 显式保留旧 MSI UpgradeCode `5e7f9fd6-193c-55c1-8cb5-063d4a3cd2bb`。

## 模板来源与维护

模板来自当前锁定的 Tauri CLI **v2.12.4**，按 MIT 许可使用，许可见 `LICENSE-MIT.txt`：

- [NSIS 原模板](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.12.4/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi)
- [WiX 原模板](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.12.4/crates/tauri-bundler/src/bundle/windows/msi/main.wxs)

Tauri 没有独立的默认安装文件夹配置项，因此使用自定义模板，保留原来的中文产品名和升级检测逻辑。相对上游，添加来源注释并修改：

- NSIS：`PLACEHOLDER_INSTALL_DIR`、`MULTIUSER_INSTALLMODE_INSTDIR`、各安装模式下初始化 `$INSTDIR` 的目录末级名称。
- NSIS：通过 `installerHooks` 加载自定义快捷方式宏，注册语言名称，迁移/创建/卸载桌面快捷方式；已有图标的更新与完成页的可选创建分开执行。
- WiX：`<Directory Id="INSTALLDIR">` 的 `Name`。

升级 Tauri CLI 时，应同步检查上游模板变更，保留上述目录修改，并重新构建 EXE 和 MSI；不要直接替换产品名或注册表键。

## 验证

执行 `npm run tauri build -- --bundles nsis,msi -- --locked` 生成完整安装包。

已有相应版本的可执行文件时，也可以执行 `npm run tauri bundle -- --bundles nsis,msi --ci` 单独验证打包；此命令不会重新编译应用，不应用于发布修改过的应用代码。

检查 `target/release/nsis/x64/installer.nsi` 中默认路径以 `my-assistant` 结尾，以及 `target/release/wix/x64/main.wxs` 中 `INSTALLDIR` 名为 `my-assistant`、产品名和 UpgradeCode 仍沿用旧值。实际验收需覆盖首次安装、自选目录和从旧版升级。

Windows 本地运行 `python scripts/test-installer-shortcuts.py`，会将生产 NSIS 快捷方式宏编译为测试程序，在临时目录执行 13 个场景：中英文首次创建、语言切换、旧 EXE 名迁移、无快捷方式升级、同名链接冲突和卸载清理。它不安装应用、不修改真实桌面。CI 在 Windows 打包完成后执行同一检查；交叉目标输出通过 `TAURI_NSIS_UTILS` 指定生成的 `utils.nsh` 路径。
