import os
import threading
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

load_dotenv()

from routers import auth, tracking, ranking, github, soyeon, parkmingyu, sales, dongha_sales, dongha_trainers, dogilrok_insta, pivot, yewon_games, yewon_budget, choi_chihwan, manual_chat, branch_diagnosis, jihee_revenue, jihee_gowith, jihee_cost
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── 시작 시 DB 마이그레이션 (schema.sql 자동 적용) ──
    from utils.migrate import run_migrations
    run_migrations()


    from jobs.detect_anomalies import detect
    _schedule_daily(hour=3, func=detect)  # 매일 새벽 3시 KST (신규 감지)

    import time
    def _detect_hourly():
        while True:
            time.sleep(3600)
            try:
                detect()
            except Exception as e:
                print(f"[시간별 감지 오류] {e}")
    threading.Thread(target=_detect_hourly, daemon=True).start()  # 매시간 자동 처리

    from utils.insta_scraper import collect_active_hashtags
    _schedule_daily(hour=4, func=lambda: collect_active_hashtags(amount=30))  # 매일 새벽 4시 KST (인스타 해시태그)

    from jobs.trainer_snapshot import run_snapshot_with_status as _run_trainer_snapshot
    _schedule_daily(hour=5, func=_run_trainer_snapshot)  # 매일 새벽 5시 KST (트레이너 평가)

    yield


app = FastAPI(title="FDE API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://fde.butfitvolt.click",
        "http://localhost:5173",
        "http://localhost:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 응답 gzip 압축 (JSON 크기 70~85% 감소 → 네트워크 전송 시간 단축)
app.add_middleware(GZipMiddleware, minimum_size=1000)

_AUTH_EXEMPT = {"/fde-api/auth/login", "/fde-api/health"}
_AUTH_EXEMPT_PREFIXES = {"/fde-api/sales", "/fde-api/jihee/revenue", "/fde-api/jihee/gowith", "/fde-api/jihee/cost"}


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)

    path = request.url.path
    if path in _AUTH_EXEMPT or any(path.startswith(p) for p in _AUTH_EXEMPT_PREFIXES):
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
app.include_router(dongha_trainers.router)
app.include_router(dogilrok_insta.router, prefix="/fde-api/dogilrok/insta", tags=["dogilrok-insta"])
app.include_router(pivot.router, prefix="/fde-api/pivot", tags=["pivot"])
app.include_router(yewon_games.router, prefix="/fde-api/yewon/games", tags=["yewon-games"])
app.include_router(yewon_budget.router, prefix="/fde-api/yewon/budget", tags=["yewon-budget"])
app.include_router(choi_chihwan.router, prefix="/fde-api/choi-chihwan", tags=["choi-chihwan"])
app.include_router(manual_chat.router, prefix="/fde-api/manual", tags=["manual-chat"])
app.include_router(branch_diagnosis.router, prefix="/fde-api/diagnosis", tags=["branch-diagnosis"])
app.include_router(jihee_revenue.router, prefix="/fde-api/jihee/revenue", tags=["jihee-revenue"])
app.include_router(jihee_gowith.router, prefix="/fde-api/jihee/gowith", tags=["jihee-gowith"])
app.include_router(jihee_cost.router, prefix="/fde-api/jihee/cost", tags=["jihee-cost"])


@app.get("/fde-api/health")
def health():
    """DB 연결 상태를 포함한 헬스체크 엔드포인트."""
    import psycopg2

    def _check(db_type: str) -> str:
        try:
            from utils.db import _get_conn
            conn = _get_conn(db_type)
            conn.close()
            return "ok"
        except Exception as e:
            return f"error: {e}"

    return {
        "status": "ok",
        "fde_db": _check("fde"),
        "replica_db": _check("replica"),
    }


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


from jobs.trainer_snapshot import run_snapshot_with_status as run_trainer_snapshot


@app.post("/fde-api/dongha/trainers/refresh")
def trigger_trainer_snapshot(request: Request):
    import threading
    t = threading.Thread(target=run_trainer_snapshot, daemon=True)
    t.start()
    return {"message": "트레이너 스냅샷 갱신 시작됨."}
