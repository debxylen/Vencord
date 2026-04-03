@echo off
setlocal enabledelayedexpansion

set "DIR=%~1"

if exist "%DIR%\*" (
    set "TMP=%DIR:~0,-1%"
    for %%A in ("%TMP%") do set "NAME=%%~nxA"
    set "ENTRY=%DIR%\index.tsx"
) else (
    for %%A in ("%DIR%") do (
        set "ENTRY=%%~fA"
        set "PARENT=%%~dpA"
    )
    set "TMP=!PARENT:~0,-1!"
    for %%A in ("!TMP!") do set "NAME=%%~nxA"
)

npx esbuild "%ENTRY%" ^
--bundle ^
--target=es2020 ^
--format=cjs ^
--platform=browser ^
--external:@* ^
--outdir="./dist/userplugins/%NAME%"
