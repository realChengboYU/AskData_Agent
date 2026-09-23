"""
对话管线（pipeline）包：面向对话 / 问答的构造都集中在这里。

- state.py   状态与数据模型（AgentState / AnswerOut / 关键词）
- llm.py     LLM 工厂（未配置 key 时降级）
- nodes.py   LangGraph 执行节点（记忆 -> 意图 -> 查询 -> 执行 -> 答案）
- graph.py   图组装与编译（PostgresSaver 作短期记忆 checkpointer）
- runner.py  多轮流式运行入口 run_agent_stream
"""

from app.services.pipeline.llm import get_llm
from app.services.pipeline.runner import (
    delete_session,
    export_session_markdown,
    get_history,
    list_sessions,
    rename_session,
    run_agent_stream,
)

__all__ = [
    "get_llm",
    "run_agent_stream",
    "get_history",
    "list_sessions",
    "delete_session",
    "rename_session",
    "export_session_markdown",
]
