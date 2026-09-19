from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, HTTPException, status

from app.config import DEMO_USERS, JWT_ALGORITHM, SECRET_KEY, TOKEN_EXPIRE_MINUTES
from app.schemas import LoginRequest, LoginResponse

router = APIRouter(prefix="/api", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest) -> LoginResponse:
    user = DEMO_USERS.get(payload.email.strip().lower())
    if not user or user["password"] != payload.password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="邮箱或密码不正确",
        )

    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=TOKEN_EXPIRE_MINUTES)
    token = jwt.encode(
        {
            "sub": payload.email.strip().lower(),
            "name": user["name"],
            "exp": exp,
        },
        SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )

    return LoginResponse(
        token=token,
        user={
            "email": payload.email.strip().lower(),
            "name": user["name"],
            "plan": user["plan"],
        },
    )
