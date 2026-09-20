"""
对话管线（pipeline）的 LangGraph 节点：纯多轮对话。

- remember：把用户问题写入会话历史（短期记忆，随 checkpointer 持久化）。
- generate：基于完整会话历史调用 LLM 生成回复，并追回助手消息。
无 SQL / 图表 / 意图路由 / 模板降级等其它功能。
"""

from langsmith import traceable

from app.services.pipeline.llm import chat_completion
from app.services.pipeline.state import AgentState


@traceable(run_type="chain", name="agent.remember")
def _remember_user(state: AgentState) -> dict:
    msgs = list(state.get("messages") or [])
    msgs.append({"role": "user", "content": state.get("question", "")})
    return {"messages": msgs}


@traceable(run_type="chain", name="agent.generate")
def _generate(state: AgentState) -> dict:
    conversation = list(state.get("messages") or [])
    reasoning = ""
    try:
        out = chat_completion(conversation)
        if out.get("error"):
            answer = f"（LLM 调用失败：{out['error']}）"
        else:
            answer = out.get("content") or ""
            reasoning = out.get("reasoning_content") or ""
    except Exception as exc:  # LLM 调用失败
        answer = f"（LLM 调用失败：{exc}）"

    conversation.append({"role": "assistant", "content": answer, "reasoning": reasoning})
    # 把模型 thinking 一并写进状态/返回，供前端展示（reasoning 以 list 形式返回）
    return {"answer": answer, "reasoning": [reasoning] if reasoning else [], "messages": conversation}
