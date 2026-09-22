@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install Node.js 22 or newer, then run this file again.
  pause
  exit /b 1
)
node tools\start-local.mjs
set "APP_EXIT=%errorlevel%"
if not "%APP_EXIT%"=="0" pause
exit /b %APP_EXIT%
