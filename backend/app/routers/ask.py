from typing import Optional

import json

import jwt
from fastapi import APIRouter, Depends, Header
from fastapi.responses import StreamingResponse

from app.config import JWT_ALGORITHM, SECRET_KEY
from app.schemas import AskRequest, AskResponse, HistoryResponse, SessionsResponse
from app.services.ask_engine import answer_question
from app.services.pipeline import (
    delete_session,
    get_history,
    list_sessions,
    run_agent_stream,
)

router = APIRouter(prefix="/api", tags=["ask"])


def get_user_key(authorization: Optional[str] = Header(default=None)) -> str:
    """从 Bearer token 解析用户标识，用于长期记忆命名空间；无 token 时回退为 anonymous。"""
    if authorization and authorization.lower().startswith("bearer "):
        try:
            payload = jwt.decode(authorization[7:], SECRET_KEY, algorithms=[JWT_ALGORITHM])
            return payload.get("sub", "anonymous")
        except Exception:
            pass
    return "anonymous"


@router.post("/ask", response_model=AskResponse)
def ask(
    payload: AskRequest,
    user_key: str = Depends(get_user_key),
) -> AskResponse:
    result = answer_question(
        payload.question,
        session_id=payload.session_id,
        user_key=user_key,
    )
    return AskResponse(
        question=result.get("question", ""),
        answer=result.get("answer", ""),
        reasoning=result.get("reasoning", []),
        sql=result.get("sql"),
        chart=result.get("chart"),
        session_id=result.get("session_id"),
    )


@router.post("/ask/stream")
async def ask_stream(
    payload: AskRequest,
    user_key: str = Depends(get_user_key),
) -> StreamingResponse:
    """流式问答（SSE）：逐块推送模型 thinking / answer 增量。"""

    async def event_stream():
        async for event in run_agent_stream(payload.question, payload.session_id, user_key):
            yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/ask/history", response_model=HistoryResponse)
def history(session_id: Optional[str] = None) -> HistoryResponse:
    """读取某会话的历史消息（含模型历史回复），用于前端恢复对话。"""
    data = get_history(session_id)
    return HistoryResponse(session_id=data.get("session_id"), messages=data.get("messages", []))


@router.get("/ask/sessions", response_model=SessionsResponse)
def sessions() -> SessionsResponse:
    """枚举历史会话列表（标题=首条用户消息），按最近更新倒序。"""
    return SessionsResponse(sessions=list_sessions())


@router.delete("/ask/sessions/{session_id}")
def remove_session(session_id: str) -> dict:
    """删除某个历史会话（连同它的所有 checkpoint / 历史消息）。"""
    ok = delete_session(session_id)
    return {"deleted": ok, "session_id": session_id}
