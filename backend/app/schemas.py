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
    session_id: Optional[str] = None


class HistoryMessage(BaseModel):
    role: str  # 'user' | 'assistant'
    content: str
    reasoning: Optional[str] = None  # 助手消息的模型思考过程（供前端恢复）


class HistoryResponse(BaseModel):
    session_id: Optional[str] = None
    messages: list[HistoryMessage] = []


class SessionItem(BaseModel):
    session_id: str
    title: str = "（新会话）"
    updated_at: Optional[str] = None
    message_count: int = 0


class SessionsResponse(BaseModel):
    sessions: list[SessionItem] = []
