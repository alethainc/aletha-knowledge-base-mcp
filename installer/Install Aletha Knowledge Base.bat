@echo off
REM ============================================================================
REM  Aletha Knowledge Base - Installer for Claude Desktop (Windows)
REM
REM  Double-click this file to install. No technical knowledge required.
REM ============================================================================

echo.
echo Starting Aletha Knowledge Base installer...
echo.

REM Run the PowerShell installer with execution policy bypass
powershell -ExecutionPolicy Bypass -File "%~dp0install.ps1"

echo.
echo Press any key to close this window...
pause >nul
