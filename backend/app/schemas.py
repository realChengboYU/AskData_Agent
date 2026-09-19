from typing import Any, Optional

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    token: str
    token_type: str = "bearer"
    user: dict


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1)
    session_id: Optional[str] = None


class AskResponse(BaseModel):
    question: str
    answer: str
    reasoning: list[str] = []
    sql: Optional[str] = None
    chart: Optional[dict] = None
