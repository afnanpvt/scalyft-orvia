@echo off
echo Stopping any running Vite dev server...
taskkill /f /im node.exe >nul 2>&1
timeout /t 1 /nobreak >nul
echo Starting scalyft-orvia dev server...
cd /d "%~dp0"
npm run dev
