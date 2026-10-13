@echo off
chcp 65001 >nul
title Pulso Global
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Necesitas Node.js 20 o superior. Abriendo la pagina de descarga...
  start "" https://nodejs.org/es/download
  pause
  exit /b 1
)
node scripts\iniciar.mjs
pause
