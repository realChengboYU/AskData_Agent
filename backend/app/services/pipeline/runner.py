"""
对话管线（pipeline）的运行入口：一次多轮对话。

对外暴露 `run_agent(question, session_id, user_key) -> dict`，
返回 {question, answer, session_id}。
"""

import json
import uuid
from typing import AsyncIterator, Optional

from langsmith import traceable

from app.services.pipeline.graph import _GRAPH
from app.services.pipeline.llm import _env


@traceable(run_type="chain", name="agent.run")
def run_agent(
    question: str,
    session_id: Optional[str] = None,
    user_key: Optional[str] = None,
) -> dict:
    """跑一次多轮对话（带短期记忆）。"""
    q = (question or "").strip()
    if not q:
        return {
            "question": q,
            "answer": "请输入内容后再发送。",
            "reasoning": [],
            "session_id": session_id,
        }

    thread_id = session_id or f"anon-{uuid.uuid4().hex}"
    config = {"configurable": {"thread_id": thread_id}}
    state = _GRAPH.invoke(
        {"question": q, "user_key": user_key or thread_id},
        config,
    )
    return {
        "question": q,
        "answer": state.get("answer", ""),
        "reasoning": state.get("reasoning", []),
        "session_id": thread_id,
    }


async def run_agent_stream(
    question: str,
    session_id: Optional[str] = None,
    user_key: Optional[str] = None,
) -> AsyncIterator[dict]:
    """流式多轮对话：逐块返回模型 thinking / answer 增量（SSE 事件），并在结束时持久化会话。

    事件形状：
      {"type":"reasoning","delta":str}   模型思考增量
      {"type":"text","delta":str}        回答增量
      {"type":"error","error":str}       出错
      {"type":"done","answer", "reasoning", "session_id"}  完成
    """
    q = (question or "").strip()
    if not q:
        yield {"type": "error", "error": "请输入内容后再发送。", "session_id": session_id}
        return

    thread_id = session_id or f"anon-{uuid.uuid4().hex}"
    config = {"configurable": {"thread_id": thread_id}}

    try:
        history = get_history(thread_id).get("messages") or []
    except Exception:  # pragma: no cover
        history = []
    llm_messages = [{"role": m.get("role", "user"), "content": m.get("content", "")} for m in history]
    llm_messages.append({"role": "user", "content": q})

    reasoning_parts: list[str] = []
    text_parts: list[str] = []
    try:
        from langchain_deepseek import ChatDeepSeek

        api_key, base_url, model = _env()
        if not api_key:
            raise RuntimeError("未配置 LLM：请在 backend/.env 设置 LLM_API_KEY")
        llm = ChatDeepSeek(model=model, api_key=api_key, base_url=base_url, temperature=0.7, timeout=120)
        async for chunk in llm.astream(llm_messages):
            for b in (getattr(chunk, "content_blocks", None) or []):
                t = b.get("type") if isinstance(b, dict) else getattr(b, "type", None)
                if t == "reasoning":
                    delta = b.get("reasoning", "") if isinstance(b, dict) else getattr(b, "reasoning", "")
                    if delta:
                        reasoning_parts.append(delta)
                        yield {"type": "reasoning", "delta": delta}
                elif t == "text":
                    delta = b.get("text", "") if isinstance(b, dict) else getattr(b, "text", "")
                    if delta:
                        text_parts.append(delta)
                        yield {"type": "text", "delta": delta}
    except Exception as exc:
        yield {"type": "error", "error": f"LLM 调用失败：{exc}"}
        return

    answer = "".join(text_parts)
    reasoning = "".join(reasoning_parts)

    # 持久化会话（含 reasoning，供刷新 / 历史恢复），不重复调用 LLM
    try:
        full = history + [
            {"role": "user", "content": q},
            {"role": "assistant", "content": answer, "reasoning": reasoning},
        ]
        _GRAPH.update_state(config, {"messages": full})
    except Exception:
        pass

    yield {
        "type": "done",
        "answer": answer,
        "reasoning": [reasoning] if reasoning else [],
        "session_id": thread_id,
    }


def get_history(session_id: Optional[str] = None) -> dict:
    """读取某会话的历史消息（来自 checkpointer 的短期记忆）。"""
    if not session_id:
        return {"session_id": None, "messages": []}
    messages = []
    try:
        from app.services.memory import get_checkpointer
        cp = get_checkpointer()
        tup = cp.get_tuple({"configurable": {"thread_id": session_id}})
        if tup is not None:
            cv = (tup.checkpoint or {}).get("channel_values") or {}
            messages = cv.get("messages") or []
    except Exception:
        messages = []
    return {"session_id": session_id, "messages": messages}


def list_sessions(limit: int = 50) -> list[dict]:
    """枚举所有历史会话（去重 thread_id），按最近更新倒序。

    返回 [{session_id, title, updated_at, message_count}]。标题取该会话首条用户消息。
    """
    sessions = []
    try:
        from app.services.memory import get_checkpointer, get_connection
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT DISTINCT thread_id FROM checkpoints WHERE thread_id IS NOT NULL"
                )
                thread_ids = [r[0] for r in cur.fetchall()]
        cp = get_checkpointer()
        for tid in thread_ids:
            msgs: list = []
            ts: Optional[str] = None
            try:
                tup = cp.get_tuple({"configurable": {"thread_id": tid}})
                if tup is not None:
                    cv = (tup.checkpoint or {}).get("channel_values") or {}
                    msgs = cv.get("messages") or []
                    ts = (tup.checkpoint or {}).get("ts")
            except Exception:
                msgs = []
                ts = None
            title = ""
            for m in msgs:
                if isinstance(m, dict) and m.get("role") == "user":
                    text = (m.get("content") or "").strip()
                    if text:
                        title = text[:30]
                        break
            sessions.append(
                {
                    "session_id": tid,
                    "title": title or "（新会话）",
                    "updated_at": ts,
                    "message_count": len(msgs),
                }
            )
        sessions.sort(key=lambda s: (s["updated_at"] or ""), reverse=True)
        return sessions[:limit]
    except Exception:
        return sessions[:limit]


def delete_session(session_id: Optional[str] = None) -> bool:
    """删除某会话的所有 checkpoint（短期记忆），会连同历史一起清掉。"""
    if not session_id:
        return False
    try:
        from app.services.memory import get_connection
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM checkpoints WHERE thread_id = %s", [session_id])
                try:
                    cur.execute("DELETE FROM checkpoint_writes WHERE thread_id = %s", [session_id])
                except Exception:
                    pass
        return True
    except Exception:
        return False
