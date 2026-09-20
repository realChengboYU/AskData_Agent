"""
对话管线（pipeline）的状态定义。

AgentState：LangGraph 图状态，只保留对话所需字段：
- question  ：当前用户问题
- user_key  ：长期记忆命名空间（预留）
- messages  ：会话消息历史 [{role, content}]（短期记忆，随 checkpointer 持久化）
- answer    ：智能体回复
"""

from typing import Optional, TypedDict


class AgentState(TypedDict, total=False):
    question: str
    user_key: str
    messages: list  # [{role: 'user'|'assistant', content: str, reasoning?: str}]
    answer: str
    reasoning: list  # 模型 thinking（reasoning_content），供前端展示
