@echo off
setlocal enabledelayedexpansion

set REPOS=kastrix-project-manager VST WDconnect opencode-launcher agent-rules-template inventory-app revival inventory-rn audio-tab-sync VSTHostJUCE songsterr-youtube-sync silakka54 panepon korearu ABplayer kanata vercel-server CBtyper autohotkey-gui-tool ahk-layer-tool VSThostvol mp3conv game editor Browser atcoderIDE File MyPlayer MPlayer.3 MPlayer

for %%r in (%REPOS%) do (
    echo === %%r ===
    gh repo view yuki-m0602/%%r --json description 2>nul
    gh api repos/yuki-m0602/%%r/contents/README.md 2>nul || echo No README.md
    echo.
)
