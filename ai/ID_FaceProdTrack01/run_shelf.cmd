@echo off
cd /d "%~dp0"
if not exist "C:\yolo_shelf\.venv\Scripts\python.exe" (
    echo Khong tim thay Python tai C:\yolo_shelf\.venv\Scripts\python.exe
    pause
    exit /b 1
)
"C:\yolo_shelf\.venv\Scripts\python.exe" track_customers.py --shelf %*
if errorlevel 1 echo Xem thong bao loi phia tren.
pause
