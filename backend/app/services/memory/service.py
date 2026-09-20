"""
MemoryService：面向智能体的高层记忆封装（记忆文件夹 / Memory package）。

把「长期记忆读写」与「短期记忆说明」收敛到一处，智能体只调这里：
- load_long_term(user_key)  -> 读该用户跨会话记忆
- remember_turn(user_key, intent, question) -> 写长期记忆并返回累计咨询次数
- build_notes(messages, turns) -> 生成便于前端展示的记忆说明（reasoning 用）
"""

from typing import Any, Optional

from app.services.memory.store import get_store


class MemoryService:
    def __init__(self) -> None:
        self.store = get_store()

    def load_long_term(self, user_key: str) -> list:
        """读取该用户的长期记忆（跨会话）。PG 不可用时返回空列表。"""
        try:
            return self.store.search(("user", user_key or "anonymous"), limit=20)
        except Exception:
            return []

    def remember_turn(self, user_key: str, intent: str, question: str) -> int:
        """写长期记忆：累计咨询次数 + 记录最近话题。返回最新累计次数。"""
        try:
            ns = ("user", user_key or "anonymous")
            item = self.store.get(ns, "visit_count")
            visits = dict(item.value) if item else {"count": 0}
            visits["count"] = int(visits.get("count", 0)) + 1
            self.store.put(ns, "visit_count", visits)
            self.store.put(ns, "last_topic", {"intent": intent, "question": question})
            return visits["count"]
        except Exception:
            return 0

    def build_notes(self, messages: list, turns: int, user_key: str = "") -> list:
        """生成记忆说明（写进 reasoning，便于前端看到记忆生效）。"""
        notes = []
        if len(messages) > 1:
            notes.append(f"短期记忆：已加载同会话前 {len(messages) - 1} 条消息，本轮为多轮对话。")
        memories = self.load_long_term(user_key)
        if memories:
            notes.append(f"长期记忆：已加载该用户 {len(memories)} 条跨会话记忆。")
        if turns > 1:
            notes.append(f"长期记忆：这是您第 {turns} 次咨询（跨会话累计）。")
        return notes


_service: Optional[MemoryService] = None


def get_memory_service() -> MemoryService:
    global _service
    if _service is None:
        _service = MemoryService()
    return _service
