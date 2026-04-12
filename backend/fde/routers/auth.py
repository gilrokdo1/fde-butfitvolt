import base64
import json
import re

import requests
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from utils.auth import create_access_token
from utils.db import safe_db

router = APIRouter()

BUTFIT_API = "https://api.butfit.io"


class LoginRequest(BaseModel):
    phone_number: str
    password: str


def _clean_phone(phone: str) -> str:
    return re.sub(r"[^0-9]", "", phone)


def _log_login(user_id: int | None, user_name: str | None, action: str):
    try:
        with safe_db("fde") as (conn, cur):
            cur.execute(
                "INSERT INTO login_logs (user_id, user_name, action_type) VALUES (%s, %s, %s)",
                (user_id, user_name, action),
            )
    except Exception:
        pass


@router.post("/login")
def login(body: LoginRequest):
    phone = _clean_phone(body.phone_number)
    if not phone:
        raise HTTPException(400, "전화번호를 입력해주세요")

    try:
        resp = requests.post(
            f"{BUTFIT_API}/user/token/",
            json={"phone_number": phone, "password": body.password},
            timeout=10,
        )
    except requests.RequestException:
        raise HTTPException(502, "버핏서울 인증 서버에 연결할 수 없습니다")

    if resp.status_code != 200:
        _log_login(None, None, "login_fail")
        raise HTTPException(401, "전화번호 또는 비밀번호가 올바르지 않습니다")

    butfit_data = resp.json()
    access_token = butfit_data.get("access") or butfit_data.get("access_token", "")

    try:
        payload_part = access_token.split(".")[1]
        padding = 4 - len(payload_part) % 4
        decoded = json.loads(base64.b64decode(payload_part + "=" * padding))
        user_id = decoded.get("user_id")
    except Exception:
        raise HTTPException(500, "토큰 디코딩 실패")

    try:
        user_resp = requests.get(
            f"{BUTFIT_API}/api/user/{user_id}/",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        user_data = user_resp.json() if user_resp.status_code == 200 else {}
    except Exception:
        user_data = {}

    name = user_data.get("name", "")
    photo_100 = user_data.get("photo_100px_uri", "")
    photo_400 = user_data.get("photo_400px_uri", "")

    token = create_access_token({
        "user_id": user_id,
        "phone_number": phone,
        "name": name,
    })

    _log_login(user_id, name, "login_success")

    return {
        "success": True,
        "token": token,
        "user": {
            "id": user_id,
            "name": name,
            "phone_number": phone,
            "photo_100px_uri": photo_100,
            "photo_400px_uri": photo_400,
        },
    }


@router.get("/me")
def me(request: Request):
    user = request.state.user
    return {
        "user_id": user["user_id"],
        "phone_number": user["phone_number"],
        "name": user["name"],
    }
