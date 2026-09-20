"""
Agent 门面（facade）。

对话/问答相关的具体构造已迁移到 `app/services/pipeline/` 包：
    state.py   /  llm.py  /  nodes.py  /  graph.py  /  runner.py

这里仅对外保留 `run_agent` / `get_llm`，保持既有调用（如 ask_engine）不变。
"""

from app.services.pipeline import get_llm, run_agent

__all__ = ["run_agent", "get_llm"]
