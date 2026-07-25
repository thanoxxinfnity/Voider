@echo off
title Voider 3D Studio
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  ============================================
  echo   Node.js install nahi hai!
  echo   Abhi nodejs.org khul raha hai - wahan se
  echo   "LTS" version install karo, phir ye file
  echo   dobara double-click karo.
  echo  ============================================
  echo.
  start https://nodejs.org
  pause
  exit /b 1
)

echo.
echo  Voider 3D Studio start ho raha hai...
echo  Browser khud khul jayega.
echo  (Band karne ke liye ye window close kar do)
echo.
node server.js
pause
