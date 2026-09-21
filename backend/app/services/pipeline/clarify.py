"""human-in-the-loop 澄清：当查询口径有歧义时，智能体调用 `clarify` 工具向用户提问。

- `clarify_tool`：一个 langchain 结构化工具，让模型在需要澄清时选择调用它。
- `_pending`：进程内暂存「待澄清」状态（按 session_id），供前端展示后可恢复。
- `parse_clarify`：从工具调用中解析出 {question, options}。

对齐 AskData Studio 的 `output_actions: [clarify]`（其底层是 interrupt/resume）。
这里用「工具即动作」的方式实现：模型调用 clarify 即请求澄清，流程暂停，待用户选择后恢复。
"""

from __future__ import annotations

from typing import Any, Optional

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

CLARIFY_NAME = "clarify"
CLARIFY_SENTINEL = "__CLARIFY_REQUESTED__"


class ClarifyInput(BaseModel):
    """clarify 工具的入参。"""

    question: str = Field(description="需要向用户澄清的问题")
    options: list[dict] = Field(
        description="2 个及以上选项，每项含 {id, label, description}；recommended 可选"
    )


def _clarify_fn(question: str, options: list) -> str:
    # 正常情况下由流程拦截，不真正执行；返回哨兵便于兜底识别。
    return CLARIFY_SENTINEL


def make_clarify_tool() -> StructuredTool:
    """构造澄清工具（在 SQL 工具之外追加，供模型在歧义时选择调用）。"""
    return StructuredTool.from_function(
        func=_clarify_fn,
        name=CLARIFY_NAME,
        description=(
            "当查询口径（指标 / 时间范围 / 维度 / 表含义）有歧义，且该歧义会实质改变结果、"
            "又无法从输入确定时，调用它向用户提问并给出 2 个及以上选项。"
        ),
        args_schema=ClarifyInput,
    )


def parse_clarify(call: dict) -> Optional[dict]:
    """从一次工具调用中解析澄清请求；非 clarify 调用或参数不合法时返回 None。"""
    name = call.get("name") or ""
    if name != CLARIFY_NAME:
        return None
    args = call.get("args") or {}
    try:
        question = str(args.get("question") or "").strip()
        options = args.get("options") or []
        if not question or not isinstance(options, list) or len(options) < 2:
            return None
        return {"question": question, "options": [dict(o) for o in options]}
    except Exception:
        return None


# ---- 待澄清状态存储（进程内，按 session_id） ----
_pending: dict[str, dict[str, Any]] = {}


def put_pending(session_id: str, clarification: dict) -> None:
    _pending[session_id] = dict(clarification)


def get_pending(session_id: str) -> Optional[dict]:
    return _pending.get(session_id)


def pop_pending(session_id: str) -> Optional[dict]:
    return _pending.pop(session_id, None)
