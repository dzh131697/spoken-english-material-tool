@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "PYEXE=F:\python\python.exe"
if not exist "%PYEXE%" set "PYEXE=python"
"%PYEXE%" rebuild_portable.py %*
echo.
pause
