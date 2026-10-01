; Extra installer steps (electron-builder includes this file in its NSIS script).
; Adds an "Uninstall MTG Dreams" entry to the Start Menu, beside the app's own shortcut,
; and removes it again when the app is uninstalled.

!macro customInstall
  CreateShortCut "$SMPROGRAMS\Uninstall ${PRODUCT_NAME}.lnk" "$INSTDIR\${UNINSTALL_FILENAME}"
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\Uninstall ${PRODUCT_NAME}.lnk"
!macroend
