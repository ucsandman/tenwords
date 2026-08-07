@echo off
setlocal
set ROOT=%~dp0
set VBS=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\tenwords-service.vbs

> "%VBS%" echo ' Starts the TenWords service hidden at login. Remove with uninstall-autostart.cmd.
>> "%VBS%" echo Set sh = CreateObject("Wscript.Shell")
>> "%VBS%" echo sh.CurrentDirectory = "%ROOT:~0,-1%"
>> "%VBS%" echo sh.Run "cmd /c npm start", 0, False

echo Installed: the TenWords service now starts hidden at every login.

netstat -ano | findstr :4710 | findstr LISTENING >nul
if errorlevel 1 (
  wscript "%VBS%"
  echo Service started now on http://localhost:4710
) else (
  echo Service is already running.
)
