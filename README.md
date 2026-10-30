<div align="center">

# Desktop Assistant

**English** | [简体中文](README.zh-CN.md)

A local desktop companion for tasks, notes, project and app shortcuts, screenshots, and screen recording.

[![GitHub Release](https://img.shields.io/github/v/release/vito2088/ai-assistant?logo=github)](https://github.com/vito2088/ai-assistant/releases/latest)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)](#platform-support)
[![Tauri](https://img.shields.io/badge/Tauri-2-orange)](https://v2.tauri.app/)

**[Download](#download)** · **[Features](#features)** · **[Usage](#usage)** · **[Development](#development)**

</div>

## Overview

Desktop Assistant brings everyday actions into one place on your desktop: capture a task or note, open a project, launch an app, take a screenshot, or record your screen. Optionally configure an AI service for chat, organizing notes, and explaining screenshots.

- **Local first:** Your records stay on your computer, with no account or online synchronization required. AI requests send the current conversation and selected materials to your configured service. Enabling automatic translation also sends recognized screenshot text automatically.
- **Always within reach:** Collapse the app into a draggable desktop icon and expand it with a click. Pinning, always-on-top mode, and launch at startup are supported.
- **Cross-platform:** Built with Tauri 2 (Rust + TypeScript), targeting Windows, macOS, and Linux.

## Features

The AI page includes contacts, private chats and groups with custom API agents, local Codex CLI and Claude Code. Assign work with mentions, wait for another agent to finish, filter messages by member, and set permissions per contact or conversation. CLI contacts require no API key in this app. See [AI collaboration](docs/ai-collaboration.md). Drag handles in the settings feature tree reorder sidebar entries, subpages and tools; see [feature visibility and ordering](docs/feature-visibility.md).

The unified **Reminders** tool opens a creation dialog for a countdown (with pause/resume) or a specific date and time. Enable an on-screen alert per task to slide a compact banner down from the top of the screen, stopping about 100px below the top edge. Dismiss it or snooze for five minutes. Tasks persist locally and continue while the app is minimized; missed alerts appear when the app next runs. See [timers and reminders](docs/timers-reminders.md).

| Section | Feature | Details |
| --- | --- | --- |
| AI | Contacts and collaboration | Custom API / Codex / Claude Code contacts, private chats and groups, mentions, dependent reviews, member filters, individual permissions, file/command tools, and existing note/screenshot helpers |
| Documents | Tasks | Add, complete, reopen, and delete with confirmation; press Enter to add a task |
| Documents | Notes | Create, edit, and delete multiline notes stored locally |
| Workspace | Computer profiles | Switch computers, create profiles for future binding, rename, and delete; keep each computer's shortcuts separate |
| Workspace | Projects | Save project folders and preferred editors; open with a click, search, edit, and delete |
| Workspace | Apps | Save executable paths; launch with a click, search, edit, and delete |
| Terminal | Local and SSH | Multiple CMD / PowerShell / system shell sessions; SSH password or private-key authentication, host fingerprint checks, SFTP browsing and file transfers, and individually approved AI commands/file reads |
| Tools | Screenshots | Region, full screen, or previous region; pen, arrows, rectangles, ellipses, text, mosaic, and numbered markers; undo/redo, copy, save PNG, and pin images on the desktop |
| Tools | Screen recording | Region/full-screen recording on Windows; countdown, pause/resume, draggable controls, preview, and save as MP4 |
| Tools | Calculator | Arithmetic, parentheses, decimals, percentages, sign toggle, backspace, and the last eight calculations |
| Tools | Unsaved captures | Preview, save as, and delete local capture drafts with confirmation; recover drafts after canceling a save or restarting normally |
| Settings | — | Startup, pinning, feature visibility, interface language, model configurations, capture directories, countdown, frame rate, and cursor capture |

The Tools home shows launchers and recording status. Unsaved screenshots appear only in Screenshot; videos appear only in Screen recording.

Terminal has a session sidebar and collapsible Files/AI panels, with configurable theme, font size and scrollback. Rust handles SSH authentication and optional local system credential storage; credentials are not AI tool arguments or chat context. AI uses a separate execution channel and asks for approval of the target, directory and exact operation. The managed terminal currently supports the primary AI and API contacts, targeting Linux / POSIX remote shells. Jump hosts, MFA, Agent and CLI contact integration are planned. See [terminal usage and implementation scope](docs/terminal.md).

Tools provide **Screenshot, Screen recording, Calculator, and Reminders** icons. Reorder them by dragging the feature tree in Settings. Click an icon to open a tool and use the back button to return. Returning to the list does not stop recording; its icon shows a red indicator.

The screenshot toolbar includes text recognition and an AI-marked translation button. Results appear below the toolbar and can be copied or closed with ×. Click the toolbar button to reopen a result. Settings provides two independent options, both off by default: automatically show recognized text, and automatically show its translation after a screenshot. Enabling only translation shows only the translation; enabling only recognition shows the original text with a manual translation button that reuses the recognized text. Enabling both shows both results. With both disabled, use the toolbar manually. Once closed, a result panel will not reopen automatically during that capture.

Windows uses a Rust / Win32 / Direct2D native screenshot editor and native recording region picker, countdown and controls by default. Capture, recording and text-result surfaces share the existing light theme and SVG icon shapes. The compact recording bar separates status/timing from pause/stop controls; original and translated text have separate copy actions. Annotations, copying, saving, pins, offline OCR and AI translation are retained. Rust registers global shortcuts and opens native windows directly, even while the main JavaScript thread is busy. The old Windows capture WebView, warm-up window and trial/full selector have been removed. See the [native capture migration notes](docs/native-capture-v0.2.md).

Text recognition uses bundled Simplified Chinese and English OCR on the selected region, including annotations. It requires no AI model, API key, or network connection and does not upload screenshots. AI translation sends only recognized text to the selected model, translating Chinese into English and English into Chinese. Closing the window or changing the selection cancels outdated translations. Mixed text is classified by comparing Chinese character and English word counts. Automatic translation requires AI to be enabled and a usable model selected; a text-only model is sufficient. OCR runtime and language data are copied from dependencies into local assets before `npm run dev` and `npm run build`. The logo shows an AI badge only when AI is enabled and a model has been configured and selected. Disabling AI does not affect local OCR.

AI contacts can create tasks, notes and reminders, edit authorized files, run commands, and invoke Windows capture/recording or optional desktop controls. Enable the required tools in contact or conversation permissions; actual action status and results stay in the conversation. A model supporting tool calls is required. Tools use an extensible registry; see [AI local tools](docs/ai-tools.md).

## Download

**[Download the latest release from GitHub](https://github.com/vito2088/ai-assistant/releases/latest)**. Installers are published only on GitHub; the Gitee repository mirrors source code. If you are reading this on Gitee, follow the GitHub download link above.

Choose an installer under the release's **Assets**. `Source code` archives are not installers; checksums are provided in `SHA256SUMS.txt`.

| System | Download |
| --- | --- |
| Windows x64 | `x64-setup.exe` (recommended) or `.msi` |
| macOS Apple Silicon (M series) | `aarch64.dmg` |
| macOS Intel | `x64.dmg` |
| Linux x64 | `.AppImage` or `.deb` |

> Installers do not yet have production code signatures. Windows may show an unknown-publisher warning, and macOS Gatekeeper may require you to allow the app in System Settings on first launch.

## Usage

### Window modes

- **About:** The About section in Settings shows the app version, license, and project repository. The version comes from the running app; the former product/version footer has been removed.
- **Main window:** A 920 × 640 landscape layout with navigation on the left and content on the right. Settings stays at the bottom of the sidebar. Navigation supports visibility and ordering preferences, and the app remembers the last section opened. Smaller displays adapt automatically. See [layout notes](docs/sidebar-layout.md).
- **Interface language:** Choose Simplified Chinese, English, or Español in Settings. Changes apply immediately and are remembered. The main window, tools, AI settings, capture controls, and system tray are translated; user content, model configuration values, and AI responses retain their original language.
- **Desktop icon:** Drag to reposition and click to expand. Hover for actions to expand, add a task, pin, or open the compact list.
- **Compact list:** View, complete, delete, and add tasks in a small window.
- **Pinning and always-on-top mode:** Lock the window's position and keep it above ordinary windows.
- **Minimize and tray:** Minimizing keeps the taskbar icon. The tray menu can show the window or quit; quitting finishes encoding an active recording first.
- **Feature visibility:** Toggle sections and individual features in Settings. Changes apply immediately and persist after restart. Hiding a feature does not delete data.

### Tools

- **Screenshot:** Choose a display, then select a region, capture the full screen, or reuse the last region. Annotate with the toolbar. Ctrl+Z / Ctrl+Shift+Z undo/redo, The checkmark, Enter, or Ctrl+C copies and finishes the capture. Use Save before X, or Ctrl+S, to save a PNG; Esc cancels. Pin annotated results as always-on-top desktop images; hover controls sit below the image, including tiny captures. Multiple pins can coexist.
- **Screen recording:** Choose a display and region, then pause, resume, or stop with the floating controls. Preview and save afterward. Windows uses native capture and H.264 encoding at 15, 30, or 60 FPS. Region dimensions are aligned to even pixel counts for H.264.
- **Calculator:** Click keys or type an expression. Enter or `=` calculates; Esc or `C` clears. Examples: `(2+3)*4` → `20`, `200*10%` → `20`.
- **Default directories:** Configure separate screenshot and recording directories in Settings as the initial locations for save dialogs.
- **Global shortcuts:** Ctrl+Alt+A takes a screenshot; Ctrl+Alt+R starts or stops recording. Change or disable shortcuts in Settings. The app reports registration conflicts and must remain running for shortcuts to work.

Recordings currently have no audio. Scrolling screenshots, automatic window detection, audio recording, and video editing are not implemented. Local text recognition supports offline OCR; AI image-based text extraction requires an image-capable model.

### AI

1. In AI model settings, choose **Add model**. Select an international, Chinese, or local service preset, or configure a custom service. Enter a configuration name, choose an actual model in the mappings at the bottom, and provide an API key if required. Then save and test. Cloud endpoints require HTTPS; localhost and 127.0.0.1 endpoints may use HTTP.
2. Enable image support if the model supports it, and select a default translation language. The checkbox does not give a text-only model image capabilities.
3. Add an AI contact and bind it to a model service, role, workspace and permission preset. Start a private chat or group, mention members, arrange dependent reviews and filter messages. Codex / Claude Code contacts use their locally installed CLI and existing authentication/model configuration. Translation, note and screenshot helpers use the Primary AI selected at the top of AI model settings. Changes are saved automatically; chat contacts keep their own model bindings. See [AI collaboration](docs/ai-collaboration.md).
4. Use note actions to organize, summarize, or extract tasks. Results appear within the note. Replacing the original can be undone, and replacement is blocked if another operation changed it. Extracted tasks are editable candidates and are saved only when you add the selected items.
5. Expand screenshot details to explain, translate, or extract text. Continue in chat with the original image and existing response as context. AI video analysis is not supported yet.

Settings shows saved model configurations. Adding or editing a model opens a dialog with a scrolling form and fixed title and save controls. **Test connection** is in the fixed header and tests the current draft without saving. The footer contains **Cancel / Save**. Saving closes the dialog; closing unsaved edits asks whether to discard them. See [connection tests and Zhipu endpoints](docs/ai-connection.md).

**Model mappings** appear at the bottom of the form. Each mapping has a display name and actual model ID. Select one and save to use it. Existing configurations appear as a single mapping without key migration. Add mappings manually or use quick setup to append service presets while preserving existing entries. Fetching models queries the current endpoint's compatible `/models` interface. After fetching, use the arrow beside an actual model input to search and select a model in a popup. Selection replaces that row's model while preserving a custom display name. Press Esc or click outside to close. Each configuration supports up to 50 mappings.

Fetching models does not require saving first and does not switch the active model. Continue configuring manually if authentication fails or the endpoint does not support listing models. Set image capabilities according to the service's documentation. The default translation language dropdown includes Chinese, English, Spanish, and other common languages; older custom values are preserved. The primary save button persists the configuration. Zhipu has separate standard API and Coding Plan presets; CC Switch Anthropic URLs are not Chat Completions endpoints.

AI reads explicitly attached material and can actively use authorized file, command or desktop tools for assigned tasks. The selected model service receives conversation context, authorized tool results, and desktop images when desktop observation is enabled and invoked; automatic screenshot translation sends recognized text when enabled. Chats and attachment snapshots are local, and API keys are stored separately in the operating system's credential store. Other features work without AI. Clearing chats and attachments in Settings preserves separately saved notes and tasks.

## Data storage

All application data is stored locally:

- Tasks, notes, computer profiles, project/app shortcuts, and window positions are stored in SQLite in the system application data directory. User settings are in `settings.json` in the same directory.
- AI conversations and referenced-material snapshots are also in SQLite. Deleting capture drafts or editing original notes does not change existing chat context. API keys are not written to ordinary settings storage.
- Windows screenshots stay in memory until copying or saving; copying creates no source draft. Native Save writes directly to the selected file. Pins, recordings, and unsaved captures on other systems use `capture-drafts` for later recovery. Temporary OCR images are cleaned after processing or cancellation.
- Deleting a project or app shortcut removes only its record, not files on disk.
- Force-terminating the process may leave a video unplayable if encoding has not finished.

## Platform support

| Platform | Screenshots and recording | Validation |
| --- | --- | --- |
| Windows | GDI snapshots for screenshots and region selection; Windows Graphics Capture for silent H.264/MP4 recording, without a separate FFmpeg installation | Tested locally; requires Windows 10 1903 or later |
| macOS / Linux | System WebView screen selection, with screenshots or MediaRecorder recording (WebM/MP4) where supported | Capability checks and permission messages provided; not yet tested on these platforms |

macOS may require screen recording permission in System Settings → Privacy & Security. Linux capture depends on the desktop environment, screen-sharing portal, and WebKitGTK support. Account synchronization and cross-computer binding are not implemented yet.

## Development

Stack: Tauri 2 · Rust · TypeScript · Vite · SQLite.

Install Node.js, Rust, and your platform's [Tauri development prerequisites](https://v2.tauri.app/start/prerequisites/).

```powershell
npm install         # Install dependencies
npm run tauri dev   # Run locally for development
npm run tauri build # Build installers
```

Development checks:

```powershell
npm test
npm run build
cd src-tauri
cargo check
cargo test --lib
```

## More documentation

### JSON settings

Settings uses a secondary sidebar for General, Feature visibility, Screenshot, Recording, Shortcuts, AI models, Advanced, and About, with only the selected category shown on the right. Advanced provides actions to edit JSON, open it in an external editor, open its folder, reload it, and restore defaults. User settings are stored in `settings.json` in the application data directory. The default Windows path is `%APPDATA%\com.myassistant.desktop\settings.json`. The adjacent `settings.default.json` provides a reference configuration. Existing settings migrate automatically from SQLite; tasks, notes, chats, and window positions remain in the database, and model keys remain in the operating system's credential store.

Before saving, the built-in editor validates JSON syntax, field types, value ranges, shortcuts, and model references. Errors include a line/column or field path; invalid content does not overwrite the file. If external edits are invalid, the app uses built-in defaults, shows an error in Settings, and preserves the original file. Fix the file and reopen Settings or reload to restore the corrected configuration. Active capture or AI tasks continue running; related settings can be reloaded once those tasks finish.

Configuration uses standard JSON without comments or trailing commas. Keep the complete set of fields; the built-in editor provides access to defaults. `autostart: null` preserves the current system startup setting. Saves replace the file through a temporary file, and the built-in editor refuses to overwrite a file changed elsewhere since it was opened.

Product designs, module designs, and historical implementation notes are available in [docs/](docs/).

See the [capture architecture and performance research](docs/capture-architecture-research-2026-10-29.md) for the proposed native capture module and platform tradeoffs.

## License

This project is licensed under [AGPL-3.0](LICENSE).
