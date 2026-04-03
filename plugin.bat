@echo off
setlocal

set DIR=%~1

npx esbuild "%DIR%" ^
--bundle ^
--target=es2020 ^
--format=cjs ^
--platform=browser ^
--external:@* ^
--outdir="%DIR%\dist"
