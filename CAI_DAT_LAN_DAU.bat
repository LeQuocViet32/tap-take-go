@echo off
title Cai dat Tap Take Go - Smart Store
echo ========================================================
echo       DANG CAI DAT THU VIEN CHO TAP TAKE GO
echo ========================================================
echo.
echo 1/2. Dang cai dat thu vien Backend (Server)...
cd /d "%~dp0\server"
call npm install
if %errorlevel% neq 0 (
    echo.
    echo [LOI] Khong the cai dat thu vien Server!
    echo Vui long kiem tra xem may ban da cai dat Node.js chua (https://nodejs.org).
    pause
    exit /b %errorlevel%
)

echo.
echo 2/2. Dang cai dat thu vien Frontend (Client) va Build giao dien...
cd /d "%~dp0\client"
call npm install
if %errorlevel% neq 0 (
    echo.
    echo [LOI] Khong the cai dat thu vien Client!
    pause
    exit /b %errorlevel%
)

call npm run build
if %errorlevel% neq 0 (
    echo.
    echo [LOI] Build giao dien that bai!
    pause
    exit /b %errorlevel%
)

echo.
echo ========================================================
echo   [THANH CONG] Da cai dat xong tat ca thu vien!
echo   Bay gio ban co the nhap dup chuot vao file "CHAY_HE_THONG.bat"
echo   de mo ung dung va web tu dong tren trinh duyet!
echo ========================================================
pause
