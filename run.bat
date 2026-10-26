@echo off
chcp 65001 > nul
echo ========================================================
echo   RADIO VN - KÊNH PHÁT THANH AI CÁ NHÂN HÓA
echo   Hệ thống phát thanh thông minh cho người bận rộn & bác tài
echo ========================================================
echo.

cd /d "%~dp0backend"
echo [1/2] Đang khởi động máy chủ FastAPI tại http://127.0.0.1:8000...
start "" http://127.0.0.1:8000
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
pause
