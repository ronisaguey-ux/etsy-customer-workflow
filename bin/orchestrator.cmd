@echo off
REM orchestrator.cmd - start the kit's agent from a normal Windows terminal (cmd.exe or PowerShell).
REM The launcher itself is Node, so this only has to find node and hand over.
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo orchestrator: Node.js is not installed or not on PATH.
  echo   Install Node 20.12+ from https://nodejs.org, then reopen this terminal.
  exit /b 2
)
node "%~dp0orchestrator.js" %*
endlocal
