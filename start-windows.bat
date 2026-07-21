@echo off
title Voider 3D Studio
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  ============================================
  echo   Node.js install nahi hai!
  echo   https://nodejs.org se "LTS" version install
  echo   karo, phir ye file dobara double-click karo.
  echo  ============================================
  echo.
  start https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo Pehli baar setup ho raha hai, thoda ruko...
  call npm install
)

echo.
echo  Voider 3D Studio start ho raha hai...
echo  Browser khud khul jayega: http://localhost:3000
echo  (Band karne ke liye ye window close kar do)
echo.
start "" http://localhost:3000
node server.js
pause
