"""
LangGraph + LangSmith 问答智能体。

用 LangGraph 的 StateGraph 编排「意图识别 -> 生成查询 -> 执行 -> 生成答案」的流程，
接入真实 LLM（默认 DeepSeek，OpenAI 兼容接口），并用 LangSmith 追踪每一步。

关键设计：
- LLM 只在「生成自然语言答案」这一节点被调用（其余节点基于固定演示 SQL / 数据，
  保证结果可复现），从而把成本压到最低。
- 当未配置 LLM API Key 时，自动降级到模板演示逻辑（可追溯到 ask_engine），
  保证无 key 也能完整跑通、返回固定结构。
- 对外只暴露 `run_agent(question) -> dict`，返回结构与 ask_engine 完全一致。
"""

import os
from typing import Optional, TypedDict

from dotenv import load_dotenv
from langgraph.graph import StateGraph, START, END
from langsmith import traceable
from pydantic import BaseModel

from app.services import ask_engine

load_dotenv()


# ---------------------------------------------------------------------------
# LLM 工厂：未配置 key 返回 None，走模板降级
# ---------------------------------------------------------------------------
def get_llm() -> Optional["object"]:
    api_key = os.getenv("DEEPSEEK_API_KEY") or os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
    try:
        from langchain_openai import ChatOpenAI
    except Exception:  # pragma: no cover - 包未装时降级
        return None
    return ChatOpenAI(
        model=os.getenv("LLM_MODEL", "deepseek-chat"),
        api_key=api_key,
        base_url=os.getenv("LLM_BASE_URL", "https://api.deepseek.com"),
        temperature=0.1,
        timeout=60,
    )


# ---------------------------------------------------------------------------
# 结构化输出模型（用于 LLM 返回答案 + 推理步骤）
# ---------------------------------------------------------------------------
class AnswerOut(BaseModel):
    answer: str
    reasoning: list[str]


# ---------------------------------------------------------------------------
# LangGraph 状态
# ---------------------------------------------------------------------------
class AgentState(TypedDict, total=False):
    question: str
    intent: str
    steps: list
    sql: str
    chart: Optional[dict]
    rows: list
    answer: str


_SALES_KEYS = ("销售", "销量", "营收", "收入", "订单", "卖", "销售额", "商品", "top", "前五", "前5")
_RETENTION_KEYS = ("留存", "活跃", "日活", "dau", "用户数", "召回")


@traceable(run_type="chain", name="agent.route")
def _route(state: AgentState) -> dict:
    q = state.get("question", "")
    if any(k in q.lower() for k in _SALES_KEYS):
        intent = "sales"
    elif any(k in q.lower() for k in _RETENTION_KEYS):
        intent = "retention"
    else:
        intent = "fallback"
    return {"intent": intent, "steps": [f"识别业务维度：{intent}（{q}）"]}


@traceable(run_type="chain", name="agent.plan")
def _plan(state: AgentState) -> dict:
    intent = state.get("intent")
    if intent == "sales":
        sql = (
            "SELECT p.name AS product,\n"
            "       SUM(o.amount) AS total_amount\n"
            "FROM orders o\n"
            "JOIN products p ON o.product_id = p.id\n"
            "WHERE o.created_at >= date('now', '-1 month')\n"
            "GROUP BY p.name\n"
            "ORDER BY total_amount DESC\n"
            "LIMIT 5;"
        )
    elif intent == "retention":
        sql = (
            "WITH first_seen AS (\n"
            "  SELECT user_id, MIN(day) AS first_day\n"
            "  FROM events GROUP BY user_id\n"
            "),\n"
            "d7 AS (\n"
            "  SELECT f.user_id\n"
            "  FROM first_seen f JOIN events e ON e.user_id = f.user_id\n"
            "  WHERE e.day = date(f.first_day, '+7 days')\n"
            ")\n"
            "SELECT COUNT(*) AS d7_retained,\n"
            "       (SELECT COUNT(*) FROM first_seen) AS cohort\n"
            "FROM d7;"
        )
    else:
        sql = None
    return {"sql": sql, "steps": state.get("steps", []) + ["生成可追溯查询：SQL。" if sql else "该问题暂无可执行查询。"]}


@traceable(run_type="chain", name="agent.execute")
def _execute(state: AgentState) -> dict:
    intent = state.get("intent")
    products = ask_engine._TOP5_PRODUCTS
    if intent == "sales":
        rows = [
            {"商品": p["name"], "销售额": p["amount"], "占比": f"{p['share']*100:.0f}%"}
            for p in products
        ]
        chart = {
            "type": "bar",
            "title": "上月销售额 Top 5 商品",
            "labels": [p["name"] for p in products],
            "values": [p["amount"] for p in products],
            "unit": "元",
        }
    elif intent == "retention":
        rows = [
            {"指标": "D7 留存率", "数值": "42.6%"},
            {"指标": "前一周 D7 留存率", "数值": "39.1%"},
        ]
        chart = None
    else:
        rows = []
        chart = None
    return {"rows": rows, "chart": chart, "steps": state.get("steps", []) + ["对演示数据集执行查询。"]}


@traceable(run_type="chain", name="agent.answer")
def _answer(state: AgentState) -> dict:
    llm = get_llm()
    intent = state.get("intent")

    # LLM 路径：真实生成可解释答案
    if llm is not None and state.get("rows"):
        try:
            prompt = (
                "你是一名数据分析助手。请基于下面的查询和结果回答用户问题。\n"
                f"用户问题：{state['question']}\n"
                f"业务维度：{intent}\n"
                f"查询 SQL：\n{state.get('sql')}\n"
                f"查询结果：\n{state['rows']}\n\n"
                "请用简体中文输出，格式为 JSON："
                '{"answer": "给业务人员的一句话/一段可读结论", '
                '"reasoning": ["第一步", "第二步", "第三步"]}'
            )
            out = llm.with_structured_output(AnswerOut).invoke(prompt)
            return {
                "answer": out.answer,
                "steps": state.get("steps", []) + ["由大模型生成最终回答。"],
                "_llm_answer": out.reasoning,
            }
        except Exception as exc:  # LLM 调用失败则降级
            state["steps"] = state.get("steps", []) + [f"LLM 调用失败，降级为模板生成（{exc}）。"]

    # 模板降级路径（复用 ask_engine 的演示逻辑，保证无 key 也能跑通）
    return _template_answer(state)


def _template_answer(state: AgentState) -> dict:
    intent = state.get("intent")
    products = ask_engine._TOP5_PRODUCTS
    if intent == "sales":
        answer = (
            "我整理了上月销售额 Top 5 商品，从高到低依次是："
            + "；".join(f"{p['name']} {p['amount']:,} 元（约占 {p['share']*100:.0f}%）" for p in products)
            + "。其中「智能手表」领跑，贡献了整月约 24% 的销售额。"
        )
        reasoning = [
            "识别到问题涉及「销售 / 业绩」维度。",
            "定位事实表 `orders` 与维表 `products`，并按 `product_id` 关联。",
            "按时间过滤：取 `created_at` 在过去一个月内的订单。",
            "用 `GROUP BY` 聚合各商品销售额，按金额降序取前 5 名。",
        ]
    elif intent == "retention":
        answer = (
            "按最近一个新增用户群计算，第 7 天留存率为 42.6%，较前一周的 39.1% 提升约 3.5 个百分点。"
            "其中通过「收藏」功能的用户留存率更高（58.3%），可作为后续优化重点。"
        )
        reasoning = [
            "识别到问题涉及「留存 / 活跃」维度。",
            "定位事件表 `events`，按 `user_id` 与 `day` 计算首次活跃日。",
            "对每个用户取首日后第 7 天是否仍活跃，得到留存率。",
            "汇总整体 D7 留存率，并与上周做对比。",
        ]
    else:
        answer = (
            "我理解了你的问题，但当前演示数据集还没有覆盖这个维度。"
            "你可以试着问：上个月销售额前五的产品分别卖了多少？"
        )
        reasoning = ["当前为演示模式，仅内置「销售」与「留存」两类数据集。"]
    return {
        "answer": answer,
        "steps": state.get("steps", []) + reasoning,
    }


# ---------------------------------------------------------------------------
# 组装并编译 LangGraph
# ---------------------------------------------------------------------------
def _build_graph():
    g = StateGraph(AgentState)
    g.add_node("route", _route)
    g.add_node("plan", _plan)
    g.add_node("execute", _execute)
    g.add_node("answer", _answer)
    g.add_edge(START, "route")
    g.add_edge("route", "plan")
    g.add_edge("plan", "execute")
    g.add_edge("execute", "answer")
    g.add_edge("answer", END)
    return g.compile()


_GRAPH = _build_graph()


@traceable(run_type="chain", name="agent.run")
def run_agent(question: str) -> dict:
    """对外唯一入口：跑一次 LangGraph 问答，返回固定结构。"""
    q = (question or "").strip()
    if not q:
        return {
            "question": q,
            "answer": "请先输入一个问题，例如：上个月销售额前五的产品分别卖了多少？",
            "reasoning": ["未检测到有效问题。"],
            "sql": None,
            "chart": None,
        }
    state = _GRAPH.invoke({"question": q})
    return {
        "question": q,
        "answer": state.get("answer", ""),
        "reasoning": state.get("steps", []),
        "sql": state.get("sql"),
        "chart": state.get("chart"),
    }
