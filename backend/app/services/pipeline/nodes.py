"""
对话管线（pipeline）的 LangGraph 节点：多轮对话（可绑定 SQL 工具）。

- remember：把用户问题写入会话历史（短期记忆，随 checkpointer 持久化）。
- generate：基于完整会话历史调用 LLM 生成回复；若配置了数据源连接串，则绑定
  SQLDatabaseToolkit 的 4 个工具并执行工具调用循环，否则退化为纯对话。
"""

from langsmith import traceable

from app.datasource.pg import PG_CONNECTION_STRING
from app.services.pipeline.llm import chat_completion, chat_with_tools, get_llm
from app.services.pipeline.router import (
    has_recent_result,
    recent_result_context,
    route_intent,
)
from app.services.pipeline.state import AgentState
from app.skills import get_skill_context
from app.tools.SQLTools.sql_tools import get_sql_tools


@traceable(run_type="chain", name="agent.remember")
def _remember_user(state: AgentState) -> dict:
    msgs = list(state.get("messages") or [])
    msgs.append({"role": "user", "content": state.get("question", "")})
    return {"messages": msgs}


@traceable(run_type="chain", name="agent.generate")
def _generate(state: AgentState) -> dict:
    conversation = list(state.get("messages") or [])
    reasoning = ""
    tools_info: list = []
    q = state.get("question") or ""
    try:
        llm = get_llm()
        tools = get_sql_tools(llm, db_url=PG_CONNECTION_STRING)
        route = route_intent(q, bool(tools), has_recent_result(conversation))
        if route == "database_query":
            # 查询能力走 database_query Skill：注入 SKILL.md 指令 + 按 allowed_tools 收敛工具面。
            skill_instructions, allowed_tools = get_skill_context("database_query")
            answer, reasoning, tools_info, error = chat_with_tools(
                llm,
                tools,
                conversation,
                skill_instructions=skill_instructions,
                allowed_tools=allowed_tools,
            )
            if error:
                answer = f"（SQL 工具调用失败：{error}）"
        elif route == "data_qa":
            # 解释已有结果：不重查库，注入 data_qa Skill，并附上一步查询结果。
            skill_instructions, _ = get_skill_context("data_qa")
            rec = recent_result_context(conversation)
            if rec:
                conversation = conversation + [{"role": "user", "content": f"[已有查询结果]\n{rec}"}]
            out = chat_completion(conversation, skill_instructions=skill_instructions)
            if out.get("error"):
                answer = f"（LLM 调用失败：{out['error']}）"
            else:
                answer = out.get("content") or ""
                reasoning = out.get("reasoning_content") or ""
        else:
            # 普通对话：不加 Skill、不绑定工具
            out = chat_completion(conversation)
            if out.get("error"):
                answer = f"（LLM 调用失败：{out['error']}）"
            else:
                answer = out.get("content") or ""
                reasoning = out.get("reasoning_content") or ""
    except Exception as exc:  # LLM 调用失败
        answer = f"（LLM 调用失败：{exc}）"

    conversation.append(
        {"role": "assistant", "content": answer, "reasoning": reasoning, "tools": tools_info}
    )
    # 把模型 thinking 一并写进状态/返回，供前端展示（reasoning 以 list 形式返回）
    return {
        "answer": answer,
        "reasoning": [reasoning] if reasoning else [],
        "tools": tools_info,
        "messages": conversation,
    }
