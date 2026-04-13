import os
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from database import init_db
from routers import upload, inventory, shipment, dashboard, export, chat, report, ledger, manual_entry

app = FastAPI(title="The Future Logistics", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 라우터 등록 (React catch-all보다 먼저)
app.include_router(upload.router, prefix="/api", tags=["업로드"])
app.include_router(inventory.router, prefix="/api", tags=["재고"])
app.include_router(shipment.router, prefix="/api", tags=["출고"])
app.include_router(dashboard.router, prefix="/api", tags=["대시보드"])
app.include_router(export.router, prefix="/api", tags=["내보내기"])
app.include_router(chat.router, prefix="/api", tags=["AI 채팅"])
app.include_router(report.router, prefix="/api", tags=["AI 리포트"])
app.include_router(ledger.router, prefix="/api", tags=["수불부"])
app.include_router(manual_entry.router, prefix="/api", tags=["수동입력"])


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    import traceback
    return JSONResponse(status_code=500, content={"detail": str(exc), "trace": traceback.format_exc()})


@app.get("/api/health")
def health():
    from database import get_db
    try:
        with get_db() as conn:
            r = conn.execute("SELECT COUNT(*) as cnt FROM product_master").fetchone()
            return {"status": "ok", "db": "postgresql", "product_count": r["cnt"]}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@app.on_event("startup")
def startup():
    init_db()


# ─── React 빌드 결과물 서빙 (맨 마지막에 등록) ───
FRONTEND_BUILD = Path(__file__).resolve().parent.parent / "frontend" / "build"

if FRONTEND_BUILD.exists():
    # /static/* → JS, CSS, 미디어 파일
    app.mount("/static", StaticFiles(directory=str(FRONTEND_BUILD / "static")), name="static")

    # 그 외 모든 경로 → React SPA
    @app.api_route("/{full_path:path}", methods=["GET"], include_in_schema=False)
    async def serve_react(request: Request, full_path: str):
        # /api 경로는 여기까지 안 옴 (위에서 처리됨)
        file_path = FRONTEND_BUILD / full_path
        if full_path and file_path.exists() and file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(FRONTEND_BUILD / "index.html"), headers={"Cache-Control": "no-cache, no-store, must-revalidate"})
