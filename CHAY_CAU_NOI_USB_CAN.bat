@echo off
cd /d "%~dp0"
set /p COM_PORT="Nhap cong COM cua ESP32 (nhan Enter de dung mac dinh COM5): "
if "%COM_PORT%"=="" set COM_PORT=COM5
set /p SLOT_ID="Nhap ma o can tren web (nhan Enter de dung mac dinh KH1_1): "
if "%SLOT_ID%"=="" set SLOT_ID=KH1_1
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bridge-usb-scale.ps1" -Port "%COM_PORT%" -SlotId "%SLOT_ID%"
pause
