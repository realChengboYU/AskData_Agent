"""提示词模块：集中管理发送给 LLM 的系统提示与消息构造。

- system.SYSTEM_PROMPT：默认系统提示词（角色 / 能力 / 准则）。
- builder.build_messages：构造完整消息列表（system + 历史 + 当前问题）。
- builder.strip_history：仅保留 role/content 的历史。
"""

from app.prompt.system import SYSTEM_PROMPT
from app.prompt.builder import build_messages, compose_system_prompt, strip_history

__all__ = ["SYSTEM_PROMPT", "build_messages", "compose_system_prompt", "strip_history"]
