import os
import threading
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv()

from routers import auth, tracking, ranking, github, soyeon, parkmingyu, sales, dongha_sales
from utils.auth import verify_access_token


def _schedule_daily(hour: int, func):
    """매일 지정 시각(KST)에 func 실행하는 백그라운드 스레드"""
    import time
    from datetime import datetime, timezone, timedelta

    KST = timezone(timedelta(hours=9))

    def loop():
        while True:
            now = datetime.now(KST)
            next_run = now.replace(hour=hour, minute=0, second=0, microsecond=0)
            if next_run <= now:
                next_run = next_run.replace(day=next_run.day + 1)
            time.sleep((next_run - now).total_seconds())
            try:
                func()
            except Exception as e:
                print(f"[스케줄 오류] {func.__name__}: {e}")

    t = threading.Thread(target=loop, daemon=True)
    t.start()


def _migrate():
    """앱 시작 시 필요한 테이블 자동 생성"""
    from utils.db import safe_db
    with safe_db("fde") as (_, cur):
        cur.execute("""
            CREATE TABLE IF NOT EXISTS soyeon_anomalies (
                id SERIAL PRIMARY KEY,
                anomaly_key VARCHAR(100) NOT NULL UNIQUE,
                anomaly_type VARCHAR(30) NOT NULL,
                user_id INT NOT NULL,
                phone_number VARCHAR(50),
                place VARCHAR(100),
                teamfit_mbs_id INT NOT NULL,
                teamfit_begin DATE,
                teamfit_end DATE,
                overlap_mbs_id INT,
                overlap_begin DATE,
                overlap_end DATE,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                detected_at TIMESTAMPTZ DEFAULT NOW(),
                resolved_at TIMESTAMPTZ,
                resolved_by VARCHAR(100),
                first_reminded_at TIMESTAMPTZ,
                escalated_at TIMESTAMPTZ
            )
        """)
        cur.execute("CREATE INDEX IF NOT EXISTS idx_soyeon_anomalies_status ON soyeon_anomalies(status)")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_soyeon_anomalies_place  ON soyeon_anomalies(place)")


@asynccontextmanager
async def lifespan(app: FastAPI):
    _migrate()
    from jobs.detect_anomalies import detect
    _schedule_daily(hour=3, func=detect)  # 매일 새벽 3시 KST
    yield


app = FastAPI(title="FDE API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://fde.butfitvolt.click",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_AUTH_EXEMPT = {"/fde-api/auth/login", "/fde-api/health"}
_AUTH_EXEMPT_PREFIX = "/fde-api/sales"


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)

    path = request.url.path
    if path in _AUTH_EXEMPT or path.startswith(_AUTH_EXEMPT_PREFIX):
        return await call_next(request)

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse(status_code=401, content={"detail": "인증이 필요합니다"})

    token = auth_header.split(" ", 1)[1]
    payload = verify_access_token(token)
    if payload is None:
        return JSONResponse(status_code=401, content={"detail": "유효하지 않은 토큰입니다"})

    request.state.user = payload
    return await call_next(request)


app.include_router(auth.router, prefix="/fde-api/auth", tags=["auth"])
app.include_router(tracking.router, prefix="/fde-api/tracking", tags=["tracking"])
app.include_router(ranking.router, prefix="/fde-api/ranking", tags=["ranking"])
app.include_router(github.router, prefix="/fde-api/github", tags=["github"])
app.include_router(soyeon.router, prefix="/fde-api/soyeon", tags=["soyeon"])
app.include_router(parkmingyu.router, prefix="/fde-api/parkmingyu", tags=["parkmingyu"])
app.include_router(sales.router, prefix="/fde-api/sales", tags=["sales"])
app.include_router(dongha_sales.router)


@app.get("/fde-api/health")
def health():
    return {"status": "ok"}


from jobs.evaluate import evaluate as run_evaluate


@app.post("/fde-api/evaluate/run")
def trigger_evaluate(request: Request):
    import threading
    t = threading.Thread(target=run_evaluate, daemon=True)
    t.start()
    return {"message": "평가 시작됨. 완료까지 수 분 소요될 수 있습니다."}


from jobs.sales_snapshot import run_snapshot


@app.post("/fde-api/dongha/sales/refresh")
def trigger_sales_snapshot(request: Request):
    import threading
    t = threading.Thread(target=run_snapshot, daemon=True)
    t.start()
    return {"message": "실적 스냅샷 갱신 시작됨."}
