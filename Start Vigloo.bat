@echo off
title Vigloo Stream Studio
cd /d "%~dp0"
echo ========================================
echo   Starting Vigloo Stream Studio...
echo   Opening: http://localhost:3005
echo ========================================
start http://localhost:3005
call npm.cmd run dev
pause
