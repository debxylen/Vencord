@echo off
setlocal enabledelayedexpansion

call pnpm build
call pnpm inject -branch auto

set "DISCORD_DIR=%LOCALAPPDATA%\Discord"

for /f "delims=" %%i in ('dir "%DISCORD_DIR%\app-*" /b /ad-h /o-n') do (
    set "LATEST=%%i"
    goto :run
)

:run
start "" "%DISCORD_DIR%\!LATEST!\Discord.exe"
