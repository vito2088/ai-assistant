"""Windows-only: execute the production NSIS shortcut macros in temporary folders.

Run after `npm run tauri -- bundle --bundles nsis --ci` to obtain Tauri's utils.nsh.
No desktop shortcuts, application installations, or registry values are modified.
"""
from pathlib import Path
import os
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent
COMPILER = Path(os.environ["LOCALAPPDATA"], "tauri", "NSIS", "makensis.exe")
UTILS = Path(os.environ.get("TAURI_NSIS_UTILS", str(ROOT / "src-tauri/target/release/nsis/x64/utils.nsh"))).resolve()
MACROS = ROOT / "src-tauri/installer/localized-shortcuts.nsh"
ZH, EN = "桌面小助手.lnk", "Desktop Assistant.lnk"

HEADER = r'''
Unicode true
RequestExecutionLevel user
SilentInstall silent
!include MUI2.nsh
!include FileFunc.nsh
!include "Win\COM.nsh"
!include "Win\Propkey.nsh"
!define MAINBINARYNAME "my-assistant"
!define BUNDLEID "com.myassistant.shortcut-test"
Var OldMainBinaryName
Var WixMode
Var UpdateMode
Var NoShortcutMode
!include "@UTILS@"
!include "@MACROS@"
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"
!insertmacro AssistantShortcutLanguages
OutFile "@OUTPUT@"
Function .onInit
  ${GetOptions} $CMDLINE "/LANG=" $LANGUAGE
FunctionEnd
Function CreateLink
  !insertmacro AssistantCreateDesktopShortcut "$INSTDIR\links"
FunctionEnd
Section
  CreateDirectory "$INSTDIR\links"
  FileOpen $9 "$INSTDIR\my-assistant.exe" w
  FileClose $9
  @SETUP@
  @ACTION@
  FileOpen $9 "$INSTDIR\targets.txt" w
  !insertmacro IsShortcutTarget "$INSTDIR\links\桌面小助手.lnk" "$INSTDIR\my-assistant.exe"
  Pop $R8
  FileWrite $9 "$R8$\r$\n"
  !insertmacro IsShortcutTarget "$INSTDIR\links\Desktop Assistant.lnk" "$INSTDIR\my-assistant.exe"
  Pop $R8
  FileWrite $9 "$R8$\r$\n"
  FileClose $9
SectionEnd
'''

def seed(name, target="my-assistant.exe"):
    return f'CreateShortcut "$INSTDIR\\links\\{name}" "$INSTDIR\\{target}"\n'

CASES = [
    ("fresh", 2052, "", "Call CreateLink", [ZH], [1, 0]),
    ("fresh", 1033, "", "Call CreateLink", [EN], [0, 1]),
    ("zh-to-en", 1033, seed(ZH) + 'StrCpy $ExistingDesktopOnly 1', "Call CreateLink", [EN], [0, 1]),
    ("en-to-zh", 2052, seed(EN) + 'StrCpy $UpdateMode 1', "Call CreateLink", [ZH], [1, 0]),
    ("legacy-binary", 1033, seed(ZH, "old-assistant.exe") + 'StrCpy $OldMainBinaryName "old-assistant.exe"', "Call CreateLink", [EN], [0, 1]),
    ("no-shortcuts", 1033, 'StrCpy $NoShortcutMode 1', "Call CreateLink", [], [0, 0]),
    ("update-opted-out", 1033, 'StrCpy $UpdateMode 1', "Call CreateLink", [], [0, 0]),
    ("refresh-opted-out", 1033, 'StrCpy $ExistingDesktopOnly 1', "Call CreateLink", [], [0, 0]),
    ("update-existing-only", 1033, seed(ZH) + 'StrCpy $NoShortcutMode 1', "Call CreateLink", [EN], [0, 1]),
    ("collision", 1033, seed(ZH) + seed(EN, "another.exe"), "Call CreateLink", [ZH, EN], [1, 0]),
    ("foreign-link", 1033, seed(ZH, "another.exe"), "Call CreateLink", [ZH, EN], [0, 1]),
    ("remove-both", 1033, seed(ZH) + seed(EN), '!insertmacro AssistantRemoveDesktopShortcuts "$INSTDIR\\links"', [], [0, 0]),
    ("remove-owned-only", 2052, seed(ZH) + seed(EN, "another.exe"), '!insertmacro AssistantRemoveDesktopShortcuts "$INSTDIR\\links"', [EN], [0, 0]),
]

def main():
    if not COMPILER.is_file() or not UTILS.is_file():
        raise SystemExit("Run the Windows NSIS bundle command first to prepare makensis and utils.nsh")
    temp_root = Path(tempfile.gettempdir()).resolve()
    with tempfile.TemporaryDirectory(prefix="assistant-shortcuts-", dir=temp_root) as temporary:
        work = Path(temporary).resolve()
        # Verify containment before TemporaryDirectory recursively cleans up.
        assert work.parent == temp_root and work.name.startswith("assistant-shortcuts-")
        for index, (name, language, setup, action, names, targets) in enumerate(CASES):
            fixture = work / str(index)
            fixture.mkdir()
            output, script = fixture / "check.exe", fixture / "check.nsi"
            source = HEADER
            for key, value in {"UTILS": UTILS, "MACROS": MACROS, "OUTPUT": output, "SETUP": setup, "ACTION": action}.items():
                source = source.replace(f"@{key}@", str(value))
            script.write_text(source, encoding="utf-8-sig")
            result = subprocess.run([str(COMPILER), "/V2", str(script)], capture_output=True, text=True)
            if result.returncode:
                raise AssertionError(result.stdout + result.stderr)
            subprocess.run([str(output), "/S", f"/LANG={language}", f"/D={fixture}"], check=True, timeout=30)
            actual_names = sorted(p.name for p in (fixture / "links").iterdir())
            assert actual_names == sorted(names), (name, language, actual_names)
            actual_targets = [int(line) for line in (fixture / "targets.txt").read_text().splitlines()]
            assert actual_targets == targets, (name, language, actual_targets)
            print(f"PASS {name} ({language})", flush=True)
    print(f"All {len(CASES)} installer shortcut scenarios passed.")

if __name__ == "__main__":
    main()
