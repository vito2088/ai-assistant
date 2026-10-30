; Desktop labels are localized independently of the stable product/registry identity.
!define ASSISTANT_SHORTCUT_ZH "桌面小助手"
!define ASSISTANT_SHORTCUT_EN "Desktop Assistant"
Var ExistingDesktopOnly
Var DesktopShortcutFound

!macro AssistantShortcutLanguages
  LangString AssistantShortcutName ${LANG_SIMPCHINESE} "${ASSISTANT_SHORTCUT_ZH}"
  LangString AssistantShortcutName ${LANG_ENGLISH} "${ASSISTANT_SHORTCUT_EN}"
!macroend

; Result in $R8. Only links owned by this installation may be migrated or removed.
!macro AssistantOwnsShortcut PATH
  !insertmacro IsShortcutTarget "${PATH}" "$INSTDIR\${MAINBINARYNAME}.exe"
  Pop $R8
  ${If} $R8 != 1
  ${AndIf} $OldMainBinaryName != ""
    !insertmacro IsShortcutTarget "${PATH}" "$INSTDIR\$OldMainBinaryName"
    Pop $R8
  ${EndIf}
!macroend

!macro AssistantRemoveShortcut PATH
  !insertmacro AssistantOwnsShortcut "${PATH}"
  ${If} $R8 = 1
    !insertmacro UnpinShortcut "${PATH}"
    Delete "${PATH}"
  ${EndIf}
!macroend

!macro AssistantRemoveDesktopShortcuts DIRECTORY
  !insertmacro AssistantRemoveShortcut "${DIRECTORY}\${ASSISTANT_SHORTCUT_ZH}.lnk"
  !insertmacro AssistantRemoveShortcut "${DIRECTORY}\${ASSISTANT_SHORTCUT_EN}.lnk"
!macroend

!macro AssistantRemoveOtherDesktopShortcut DIRECTORY NAME
  ${If} "${NAME}" != "$(AssistantShortcutName)"
    !insertmacro AssistantRemoveShortcut "${DIRECTORY}\${NAME}.lnk"
  ${EndIf}
!macroend

!macro AssistantCreateDesktopShortcut DIRECTORY
  StrCpy $DesktopShortcutFound 0
  !insertmacro AssistantOwnsShortcut "${DIRECTORY}\${ASSISTANT_SHORTCUT_ZH}.lnk"
  ${IfThen} $R8 = 1 ${|} StrCpy $DesktopShortcutFound 1 ${|}
  !insertmacro AssistantOwnsShortcut "${DIRECTORY}\${ASSISTANT_SHORTCUT_EN}.lnk"
  ${IfThen} $R8 = 1 ${|} StrCpy $DesktopShortcutFound 1 ${|}

  ${If} $DesktopShortcutFound = 0
    ${If} $ExistingDesktopOnly = 1
      Return
    ${EndIf}
    ${If} $WixMode = 0
      ${If} $UpdateMode = 1
      ${OrIf} $NoShortcutMode = 1
        Return
      ${EndIf}
    ${EndIf}
  ${EndIf}

  ; Never overwrite a same-named shortcut to another application.
  ${If} ${FileExists} "${DIRECTORY}\$(AssistantShortcutName).lnk"
    !insertmacro AssistantOwnsShortcut "${DIRECTORY}\$(AssistantShortcutName).lnk"
    ${If} $R8 != 1
      Return
    ${EndIf}
  ${EndIf}
  ClearErrors
  CreateShortcut "${DIRECTORY}\$(AssistantShortcutName).lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  ${If} ${Errors}
    Return
  ${EndIf}
  !insertmacro SetLnkAppUserModelId "${DIRECTORY}\$(AssistantShortcutName).lnk"
  !insertmacro AssistantRemoveOtherDesktopShortcut "${DIRECTORY}" "${ASSISTANT_SHORTCUT_ZH}"
  !insertmacro AssistantRemoveOtherDesktopShortcut "${DIRECTORY}" "${ASSISTANT_SHORTCUT_EN}"
!macroend
