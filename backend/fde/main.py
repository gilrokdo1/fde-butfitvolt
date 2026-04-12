import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

load_dotenv()

from routers import auth, tracking, ranking, github
from utils.auth import verify_access_token


@asynccontextmanager
async def lifespan(app: FastAPI):
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


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)

    path = request.url.path
    if path in _AUTH_EXEMPT:
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


@app.get("/fde-api/health")
def health():
    return {"status": "ok"}
