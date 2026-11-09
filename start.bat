@echo off
title Tap Take Go - Smart Retailing Store
echo ========================================================
echo       TAP TAKE GO - SMART RETAILING STORE
echo ========================================================
echo Dang khoi dong he thong Web, MQTT Broker va API...
cd /d "%~dp0\server"
node src/index.js
pause
