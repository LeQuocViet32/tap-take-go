@echo off
title Tap Take Go - Smart Retailing Store
echo ========================================================
echo       TAP TAKE GO - SMART RETAILING STORE
echo ========================================================
echo.
echo Dang khoi dong may chu Web, MQTT Broker va API...
echo Trinh duyet se tu dong mo trang web sau vai giay.
echo.
cd /d "%~dp0\server"
start http://localhost:5000
node src/index.js
pause
