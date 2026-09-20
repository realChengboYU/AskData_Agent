"""
问答引擎入口（纯对话模式）。

演示用的模板/SQL/图表问答引擎已关闭。这里只透传到对话管线（app/services/pipeline）：
    answer_question(question, session_id, user_key) -> dict
"""

from typing import Optional


def answer_question(
    question: str,
    session_id: Optional[str] = None,
    user_key: Optional[str] = None,
) -> dict:
    """对外入口：多轮对话（走 LangGraph + LLM + 短期记忆）。"""
    from app.services.pipeline import run_agent

    return run_agent(question, session_id=session_id, user_key=user_key)
