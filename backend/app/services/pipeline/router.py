"""意图路由：决定一次对话应走哪条能力分支。

分支（对齐 AskData Studio 的 preprocess→route）：
- "database_query"：数据查询（绑定 SQL 工具，注入 database_query Skill）。
- "data_qa"       ：解释/总结已有查询结果（不重查库，注入 data_qa Skill）。
- "direct_response"：普通对话（不绑定工具，不加 Skill）。

当前用轻量启发式（无额外 LLM 调用、可单测）。后续可换成模型预分类器。
"""

from __future__ import annotations

# 明确引用"上一步查询结果"的触发词：这表示用户在对已有的结果做解释/追问。
RESULT_REF_HINTS = (
    "上面", "刚才", "刚刚", "这个结果", "这些数据", "这组", "这份",
    "上一步", "之前", "上面的数据", "结果看", "结论是", "数据看", "这里面",
)

# 解释 / 总结已有结果的触发词（辅助参考）
ANALYZE_HINTS = (
    "分析", "总结", "解释", "说明", "怎么看", "什么结论", "结论",
    "占比", "对比", "差异", "差别", "趋势", "变化", "细分", "构成", "分布",
)

# 表结构 / 元数据类问题：需要查库（如 list_tables / schema），不应进 data_qa。
SCHEMA_HINTS = (
    "表结构", "有哪些表", "表名", "什么表", "字段", "什么字段", "列名",
    "数据库里", "库里", "这个库", "表清单", "元数据", "结构", "表都",
)

# 明确要求查询 / 取数的触发词（辅助，不作为硬判定）
DATA_HINTS = (
    "多少", "几个", "排名", "最高", "最低", "最大", "最小", "平均", "合计",
    "计算", "查询", "上个月", "最近", "哪个", "哪些",
)


def route_intent(
    question: str,
    has_sql_tools: bool,
    has_recent_result: bool,
) -> str:
    """返回路由：database_query | data_qa | direct_response。

    Args:
        question: 当前用户问题。
        has_sql_tools: 是否配置了数据源（可绑定 SQL 工具）。
        has_recent_result: 会话中是否已有一份查询结果（上一步取过数）。
    """
    q = (question or "").strip()
    if not q:
        return "direct_response"

    # 1) 上一步有结果，且本次明确引用它（上面/刚才/这个结果…）→ 走 data_qa（解释已有结果，不重查库）。
    #    注意：这里要求"结果引用词"，避免把「分析表结构 / 有哪些表」这类需要查库的问题误判成 data_qa。
    if has_recent_result and any(h in q for h in RESULT_REF_HINTS):
        return "data_qa"

    # 2) 有数据源 → 走 database_query（包括 schema/结构类问题，需要 list_tables / schema 工具）
    if has_sql_tools:
        return "database_query"

    # 3) 没有数据源 → 普通对话
    return "direct_response"


def has_recent_result(history: list | None) -> bool:
    """会话中是否已有一份查询结果（上一步取过数）。

    依据：最近一条 assistant 消息携带了工具调用记录（tools）或有 sql 字段。
    """
    for m in reversed(history or []):
        if isinstance(m, dict) and m.get("role") == "assistant":
            tools = m.get("tools") or []
            if tools or m.get("sql"):
                return True
    return False


def recent_result_context(history: list | None, max_chars: int = 4000) -> str:
    """把最近一次查询的工具结果打包成给 data_qa 的文本上下文。

    对结果做截断（默认 4000 字符），避免把 list_tables / 全量结果灌进提示导致模型变慢。
    """
    for m in reversed(history or []):
        if not isinstance(m, dict) or m.get("role") != "assistant":
            continue
        tools = m.get("tools") or []
        if not tools:
            continue
        parts: list[str] = []
        for t in tools:
            name = t.get("name") or ""
            args = t.get("args") or {}
            result = str(t.get("result") or "")
            # 单个结果截断，避免超长
            if len(result) > 1200:
                result = result[:1200] + "\n…（结果过长已截断）"
            parts.append(f"[工具: {name}] 入参={args}\n结果:\n{result}")
        if parts:
            ctx = "\n\n".join(parts)
            # 总长截断
            if len(ctx) > max_chars:
                ctx = ctx[:max_chars] + "\n…（上下文过长已截断）"
            return ctx
    return ""
