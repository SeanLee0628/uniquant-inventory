@echo off
echo ============================================
echo   반도체 부품 재고관리 시스템 시작
echo ============================================
echo.

REM 백엔드 의존성 설치
echo [1/3] 백엔드 의존성 설치 중...
cd backend
pip install -r requirements.txt -q
cd ..

REM 프론트엔드 의존성 설치
echo [2/3] 프론트엔드 의존성 설치 중...
cd frontend
call npm install --silent 2>nul
cd ..

echo [3/3] 서버 시작 중...
echo.
echo  Backend:  http://localhost:8000
echo  Frontend: http://localhost:3000
echo  API Docs: http://localhost:8000/docs
echo.

REM 백엔드를 백그라운드로 시작
start "Backend" cmd /c "cd backend && python -m uvicorn main:app --reload --port 8000"

REM 프론트엔드 시작
cd frontend
call npm start
