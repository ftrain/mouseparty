Unicode true
ManifestDPIAware true
RequestExecutionLevel user
SetCompressor /SOLID lzma

!include "MUI2.nsh"
!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "x64.nsh"
!include "WinVer.nsh"

!ifndef TREE | OUTFILE
  !error "makensis -DTREE=<the built app's folder> -DOUTFILE=<setup.exe> -DVERSION=1.2.3 -DVERSION_NUMBERS=1.2.3.0 installer.nsi"
!endif
!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!ifndef VERSION_NUMBERS
  !define VERSION_NUMBERS 0.0.0.0
!endif
!ifdef SIGN
  !finalize '${SIGN} "%1"'
  !uninstfinalize '${SIGN} "%1"'
!endif

!define APP "Mouse Party"
!define EXE "MouseParty.exe"
!define ID "io.github.ftrain.mouseparty"
!define PUBLISHER "Paul Ford"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${ID}"
!define APP_KEY "Software\Classes\Applications\${EXE}"
!define TOAST_KEY "Software\Classes\AppUserModelId\${EXE}"

Name "${APP}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\${APP}"
InstallDirRegKey HKCU "${UNINST_KEY}" "InstallLocation"
BrandingText "${APP} ${VERSION}"

VIProductVersion "${VERSION_NUMBERS}"
VIFileVersion "${VERSION_NUMBERS}"
VIAddVersionKey "ProductName" "${APP}"
VIAddVersionKey "CompanyName" "${PUBLISHER}"
VIAddVersionKey "LegalCopyright" "Copyright (c) 2026 Paul Ford"
VIAddVersionKey "FileDescription" "${APP} Setup"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"

!define MUI_ICON "icon.ico"
!define MUI_UNICON "icon.ico"
!define MUI_ABORTWARNING
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_PAGE_CUSTOMFUNCTION_LEAVE LeaveDirectory
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

!macro OpenWithTypes DO
  !insertmacro ${DO} .mp4
  !insertmacro ${DO} .m4v
  !insertmacro ${DO} .mkv
  !insertmacro ${DO} .mov
  !insertmacro ${DO} .avi
  !insertmacro ${DO} .webm
  !insertmacro ${DO} .ts
  !insertmacro ${DO} .m2ts
  !insertmacro ${DO} .mpg
  !insertmacro ${DO} .mpeg
  !insertmacro ${DO} .wmv
  !insertmacro ${DO} .flv
  !insertmacro ${DO} .3gp
  !insertmacro ${DO} .ogv
  !insertmacro ${DO} .mp3
  !insertmacro ${DO} .m4a
  !insertmacro ${DO} .aac
  !insertmacro ${DO} .flac
  !insertmacro ${DO} .wav
  !insertmacro ${DO} .aiff
  !insertmacro ${DO} .ogg
  !insertmacro ${DO} .opus
  !insertmacro ${DO} .wma
  !insertmacro ${DO} .pdf
  !insertmacro ${DO} .docx
  !insertmacro ${DO} .odt
  !insertmacro ${DO} .rtf
  !insertmacro ${DO} .epub
  !insertmacro ${DO} .html
  !insertmacro ${DO} .md
  !insertmacro ${DO} .txt
  !insertmacro ${DO} .pptx
  !insertmacro ${DO} .xlsx
  !insertmacro ${DO} .csv
  !insertmacro ${DO} .db
  !insertmacro ${DO} .sqlite
  !insertmacro ${DO} .sqlite3
  !insertmacro ${DO} .zip
!macroend
!macro SupportedType EXT
  WriteRegStr HKCU "${APP_KEY}\SupportedTypes" "${EXT}" ""
!macroend

!macro WaitFunction UN
  Function ${UN}WaitUntilWritable
    Exch $R0
    Push $R1
    Push $R2
    StrCpy $R1 0
    ${Do}
      ${IfNot} ${FileExists} "$R0"
        ${Break}
      ${EndIf}
      ClearErrors
      FileOpen $R2 "$R0" a
      ${IfNot} ${Errors}
        FileClose $R2
        ${Break}
      ${EndIf}
      IntOp $R1 $R1 + 1
      ${If} $R1 > 240
        MessageBox MB_OK|MB_ICONSTOP "Quit ${APP}, then try again." /SD IDOK
        SetErrorLevel 2
        Quit
      ${EndIf}
      Sleep 250
    ${Loop}
    Pop $R2
    Pop $R1
    Pop $R0
  FunctionEnd
!macroend
!insertmacro WaitFunction ""
!insertmacro WaitFunction "un."

!macro WaitForApp UN
  Push "$INSTDIR\${EXE}"
  Call ${UN}WaitUntilWritable
  Push "$INSTDIR\resources\bin\ffmpeg.exe"
  Call ${UN}WaitUntilWritable
  Push "$INSTDIR\resources\bin\mediamtx.exe"
  Call ${UN}WaitUntilWritable
  Push "$INSTDIR\resources\bin\cloudflared.exe"
  Call ${UN}WaitUntilWritable
!macroend

Var Relaunch

Function CheckInstDir
  Push $0
  ${DirState} "$INSTDIR" $0
  ${If} $0 == 1
  ${AndIfNot} ${FileExists} "$INSTDIR\${EXE}"
    StrCpy $0 taken
  ${EndIf}
  ClearErrors
  ${If} $0 == taken
    SetErrors
  ${EndIf}
  Pop $0
FunctionEnd

Function LeaveDirectory
  Call CheckInstDir
  ${If} ${Errors}
    MessageBox MB_OK|MB_ICONEXCLAMATION "$INSTDIR already has other files in it. Choose a new or empty folder, or the one ${APP} is already in." /SD IDOK
    Abort
  ${EndIf}
FunctionEnd

Function .onInit
  ${IfNot} ${RunningX64}
  ${OrIfNot} ${AtLeastWin10}
    MessageBox MB_OK|MB_ICONSTOP "${APP} needs 64-bit Windows 10 or later." /SD IDOK
    SetErrorLevel 64
    Quit
  ${EndIf}
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "/R" $1
  ${IfNot} ${Errors}
    StrCpy $Relaunch 1
  ${EndIf}
  ${If} ${Silent}
    Call CheckInstDir
    ${If} ${Errors}
      SetErrorLevel 2
      Quit
    ${EndIf}
  ${EndIf}
FunctionEnd

Section
  SetShellVarContext current
  SetRegView 64
  !insertmacro WaitForApp ""
  ${If} ${FileExists} "$INSTDIR\${EXE}"
    RMDir /r "$INSTDIR\resources"
  ${EndIf}
  SetOutPath "$INSTDIR"
  File "${TREE}\${EXE}"
  File /r "${TREE}\resources"
  WriteUninstaller "$INSTDIR\uninstall.exe"
  CreateShortcut "$SMPROGRAMS\${APP}.lnk" "$INSTDIR\${EXE}"

  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APP}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${PUBLISHER}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\${EXE},0"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" "$\"$INSTDIR\uninstall.exe$\""
  WriteRegStr HKCU "${UNINST_KEY}" "QuietUninstallString" "$\"$INSTDIR\uninstall.exe$\" /S"
  WriteRegStr HKCU "${UNINST_KEY}" "URLInfoAbout" "https://ftrain.github.io/mouseparty/"
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${UNINST_KEY}" "EstimatedSize" "$0"

  WriteRegStr HKCU "${APP_KEY}" "FriendlyAppName" "${APP}"
  WriteRegStr HKCU "${APP_KEY}\DefaultIcon" "" "$INSTDIR\${EXE},0"
  WriteRegStr HKCU "${APP_KEY}\shell\open\command" "" "$\"$INSTDIR\${EXE}$\" $\"%1$\""
  !insertmacro OpenWithTypes SupportedType

  ${If} $Relaunch == 1
    Exec '"$INSTDIR\${EXE}"'
  ${EndIf}
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  SetRegView 64
  !insertmacro WaitForApp "un."
  Delete "$INSTDIR\${EXE}"
  RMDir /r "$INSTDIR\resources"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"
  Delete "$SMPROGRAMS\${APP}.lnk"

  DeleteRegKey HKCU "${APP_KEY}"
  DeleteRegKey HKCU "${UNINST_KEY}"
  ReadRegStr $0 HKCU "${TOAST_KEY}" "CustomActivator"
  ${If} $0 != ""
    DeleteRegKey HKCU "Software\Classes\CLSID\$0"
    Delete "$TEMP\${EXE}$0.png"
  ${EndIf}
  ReadRegStr $1 HKCU "Software\Classes\CLSID\{0F82E845-CB89-4039-BDBF-67CA33254C76}\LocalServer32" ""
  ${If} $1 == "$INSTDIR\${EXE}"
    DeleteRegKey HKCU "Software\Classes\CLSID\{0F82E845-CB89-4039-BDBF-67CA33254C76}"
  ${EndIf}
  DeleteRegKey HKCU "${TOAST_KEY}"
  DeleteRegKey HKCU "Software\${EXE}"

  MessageBox MB_YESNO|MB_ICONQUESTION "Also delete what ${APP} keeps on this computer: the party file, downloads and settings?" /SD IDNO IDNO done
  RMDir /r "$LOCALAPPDATA\${APP}"
  RMDir /r "$APPDATA\${EXE}"
  done:
SectionEnd
