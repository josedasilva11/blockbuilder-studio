; Custom NSIS hooks for the BlockBuilder Studio installer.
; electron-builder inlines this into the generated installer script.

; Branding strings shown in the Windows "Installed programs" list.
!define MUI_WELCOMEPAGE_TITLE "Install BlockBuilder Studio"
!define MUI_WELCOMEPAGE_TEXT "BlockBuilder Studio is a Tinkercad-style desktop 3D editor.$\r$\n$\r$\nIt runs entirely offline, requires no account, and has no upload caps.$\r$\n$\r$\nBuilt by Marjers — https://marjers.com"
!define MUI_FINISHPAGE_TEXT "BlockBuilder Studio is now installed.$\r$\n$\r$\nDrag a shape from the left panel into the viewport to begin.$\r$\n$\r$\nIf the app helps your work, please consider supporting development at marjers.com/support."
!define MUI_FINISHPAGE_LINK "Visit marjers.com"
!define MUI_FINISHPAGE_LINK_LOCATION "https://marjers.com"

; Run after the install finishes — optional shortcut to the help page.
!macro customInstall
  WriteRegStr HKCU "Software\BlockBuilder Studio" "InstallDate" "${BUILD_TIMESTAMP}"
!macroend
