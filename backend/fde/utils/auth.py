import os
import time
from typing import Optional

from jose import JWTError, jwt

SECRET_KEY = os.getenv("FDE_JWT_SECRET", "changeme")
ALGORITHM = "HS256"
TOKEN_EXPIRE_SECONDS = 86400  # 24시간


def create_access_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = int(time.time()) + TOKEN_EXPIRE_SECONDS
    payload["iat"] = int(time.time())
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def verify_access_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
