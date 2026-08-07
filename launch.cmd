@echo off
cd /d %~dp0
netstat -ano | findstr :4710 | findstr LISTENING >nul
if not errorlevel 1 (
  echo TenWords service is already running.
  start http://localhost:4710
  exit /b 0
)
if not exist node_modules call npm install
if not exist .env (
  echo Missing .env -- copy .env.example to .env and set ANTHROPIC_API_KEY.
  exit /b 1
)
npm start
