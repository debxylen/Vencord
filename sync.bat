@echo off

echo === syncing fork ===
gh repo sync || goto :syncfail

echo === fetching updates ===
git fetch origin

echo === switching to me ===
git checkout me

for /f %%i in ('git rev-parse HEAD') do set BEFORE=%%i

echo === rebasing onto origin/main ===
git rebase origin/main || goto :fail

for /f %%i in ('git rev-parse HEAD') do set AFTER=%%i

if "%BEFORE%"=="%AFTER%" (
    echo no changes, skipping rebuild
    pause
    exit /b
)

echo changes detected...

git diff --quiet %BEFORE% %AFTER% package.json || pnpm install

git push --force-with-lease

call install.bat

pause
exit /b

:fail
echo ❌ rebase failed
pause
exit /b

:syncfail
echo ❌ gh sync failed
pause
exit /b
