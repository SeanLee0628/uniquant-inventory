#!/bin/bash
echo "============================================"
echo "  반도체 부품 재고관리 시스템 시작"
echo "============================================"
echo ""

# 백엔드 의존성 설치
echo "[1/3] 백엔드 의존성 설치 중..."
cd backend
pip install -r requirements.txt -q
cd ..

# 프론트엔드 의존성 설치
echo "[2/3] 프론트엔드 의존성 설치 중..."
cd frontend
npm install --silent 2>/dev/null
cd ..

echo "[3/3] 서버 시작 중..."
echo ""
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:3000"
echo "  API Docs: http://localhost:8000/docs"
echo ""

# 백엔드를 백그라운드로 시작
cd backend
python -m uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
cd ..

# 프론트엔드 시작
cd frontend
npm start

# 종료 시 백엔드도 종료
kill $BACKEND_PID 2>/dev/null
