import os
import time
from typing import Optional

from jose import JWTError, jwt

SECRET_KEY = os.environ.get("FDE_JWT_SECRET")
if not SECRET_KEY or len(SECRET_KEY) < 32:
    raise RuntimeError(
        "FDE_JWT_SECRET 환경변수가 설정되지 않았거나 너무 짧습니다(32자 이상 필요). "
        "EC2의 /home/ec2-user/fde1/fde-backend/.env 에 강한 난수 시크릿을 설정하세요."
    )
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
