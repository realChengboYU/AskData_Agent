from typing import Optional

import jwt
from fastapi import APIRouter, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import JWT_ALGORITHM, SECRET_KEY
from app.schemas import (
    HistoryResponse,
    SessionsResponse,
)
from app.services.pipeline import (
    delete_session,
    export_session_markdown,
    get_history,
    list_sessions,
    rename_session,
    set_session_data_source,
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


class RenameRequest(BaseModel):
    title: Optional[str] = None


@router.patch("/ask/sessions/{session_id}")
def rename_ask_session(session_id: str, payload: RenameRequest) -> dict:
    """重命名某个会话（自定义标题；空标题回退为首条用户消息）。"""
    ok = rename_session(session_id, payload.title)
    return {"renamed": ok, "session_id": session_id, "title": payload.title or ""}


class DataSourceRequest(BaseModel):
    data_source_id: Optional[str] = None


@router.patch("/ask/sessions/{session_id}/datasource")
def set_session_ds(session_id: str, payload: DataSourceRequest) -> dict:
    """设置某会话绑定的数据源（传空清除绑定）；供「每次对话只针对一个库 / 会话内切换」使用。"""
    ok = set_session_data_source(session_id, payload.data_source_id)
    return {
        "ok": ok,
        "session_id": session_id,
        "data_source_id": payload.data_source_id or None,
    }


@router.get("/ask/sessions/{session_id}/export")
def export_ask_session(session_id: str):
    """导出某会话为 Markdown 文件。"""
    md = export_session_markdown(session_id)
    filename = f"deepdata-{(session_id or 'session')[:8]}.md"
    return StreamingResponse(
        iter([md]),
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
