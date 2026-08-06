@echo off
cd /d %~dp0
if not exist node_modules call npm install
if not exist .env (
  echo Missing .env — copy .env.example to .env and set ANTHROPIC_API_KEY.
  exit /b 1
)
npm start
