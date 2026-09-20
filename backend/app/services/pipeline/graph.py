"""
对话管线（pipeline）的 LangGraph 组装：remember -> generate。

checkpointer 使用 PostgresSaver（见 app/services/memory/store.py），
按 thread_id(session_id) 持久化会话状态，实现多轮对话。
"""

from langgraph.graph import END, START, StateGraph

from app.services.pipeline.nodes import _generate, _remember_user
from app.services.pipeline.state import AgentState


def _make_checkpointer():
    try:
        from app.services.memory import get_checkpointer
        return get_checkpointer()
    except Exception:
        return None


def _build_graph(checkpointer=None):
    g = StateGraph(AgentState)
    g.add_node("remember", _remember_user)
    g.add_node("generate", _generate)
    g.add_edge(START, "remember")
    g.add_edge("remember", "generate")
    g.add_edge("generate", END)
    return g.compile(checkpointer=checkpointer)


_CHECKPOINTER = _make_checkpointer()
_GRAPH = _build_graph(_CHECKPOINTER)
