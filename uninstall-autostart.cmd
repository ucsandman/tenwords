@echo off
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\tenwords-service.vbs" 2>nul
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :4710 ^| findstr LISTENING') do taskkill /F /T /PID %%p >nul 2>&1
echo Autostart removed and the service stopped.
