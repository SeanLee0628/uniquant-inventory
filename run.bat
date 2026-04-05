@echo off
chcp 65001 >nul 2>&1
title 반도체 부품 재고관리 시스템

echo.
echo  ================================================
echo    반도체 부품 재고관리 시스템 - 원클릭 실행
echo  ================================================
echo.

cd /d "%~dp0"

REM === 1. Python 의존성 설치 ===
echo  [1/4] Python 패키지 설치 중...
cd backend
py -m pip install -r requirements.txt -q 2>nul
if errorlevel 1 (
    python -m pip install -r requirements.txt -q 2>nul
)
if errorlevel 1 (
    pip install -r requirements.txt -q 2>nul
)
cd ..

REM === 2. Node.js 의존성 설치 ===
echo  [2/4] Node.js 패키지 설치 중...
cd frontend
if not exist node_modules (
    call npm install --silent 2>nul
) else (
    echo         node_modules 이미 존재 - 스킵
)

REM === 3. React 빌드 ===
if not exist build (
    echo  [3/4] React 빌드 중... (첫 실행시 1~2분 소요)
    call npm run build 2>nul
) else (
    echo  [3/4] React 빌드 이미 존재 - 스킵 (재빌드: frontend\build 폴더 삭제 후 재실행)
)
cd ..

REM === 4. 서버 시작 ===
echo  [4/4] 서버 시작 중...
echo.
echo  ================================================
echo    http://localhost:8000 에서 접속하세요!
echo    종료하려면 이 창에서 Ctrl+C 누르세요
echo  ================================================
echo.

cd backend
py -m uvicorn main:app --host 0.0.0.0 --port 8000 2>nul
if errorlevel 1 (
    python -m uvicorn main:app --host 0.0.0.0 --port 8000 2>nul
)
pause
