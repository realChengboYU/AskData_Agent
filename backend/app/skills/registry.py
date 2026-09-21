"""Skill 注册表：从 `app/skills/` 目录扫描并加载所有 Skill。

一个 Skill = 一个目录，含：
- `config.json`：给代码的约束（name / description / allowed_tools / max_tool_calls / output_actions）
- `SKILL.md`：给模型的指令（行为准则 / SQL 契约 / 输出格式）

设计意图（对齐 AskData Studio）：
- 代码用 `config.json` 硬约束「能调哪些工具、能输出哪些动作、最多几轮」；
- 模型按 `SKILL.md` 的指令行事；
- 两者互补：模型被引导，代码被约束。新增能力 = 加一个 Skill 目录，不动核心循环。
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# 本包所在目录：`app/skills/`，是多个 Skill 目录的根。
SKILLS_DIR = Path(__file__).resolve().parent


@dataclass(frozen=True)
class SkillDefinition:
    """
    Attributes:
        name: 唯一标识（与目录名一致）。
        description: 能力一句话说明。
        instructions: SKILL.md 的完整指令文本（注入给模型）。
        allowed_tools: 工具白名单（支持 fnmatch 通配，如 `query_*`）。
        max_tool_calls: 该 Skill 允许的工具调用轮次上限。
        output_actions: 输出动作白名单（模型只能产出这些动作）。
    """

    name: str
    description: str
    instructions: str
    allowed_tools: tuple[str, ...]
    max_tool_calls: int
    output_actions: tuple[str, ...]

    def public(self) -> dict[str, Any]:
        """对外暴露：只给名称/描述/工具面/动作/轮次，剔除完整指令文本。"""
        return {
            "name": self.name,
            "description": self.description,
            "allowed_tools": list(self.allowed_tools),
            "max_tool_calls": self.max_tool_calls,
            "output_actions": list(self.output_actions),
        }


class SkillRegistry:
    """扫描并加载 `root/*/config.json` 对应的 Skill，校验后构造 SkillDefinition。
    用法：
        registry = SkillRegistry()
        skill = registry.get("database_query")   # SkillDefinition
        print(registry.list())                    # 所有 Skill（含 instructions）
        print([s.public() for s in registry.list()])  # 对外能力面（不含 instructions）
    """

    def __init__(self, root: Path = SKILLS_DIR) -> None:
        self.root = Path(root)
        self._skills: dict[str, SkillDefinition] = {}
        self.load()

    def load(self) -> None:
        """（重）扫描目录并重新加载所有 Skill；名称唯一性校验。"""
        self._skills.clear()
        for config_path in sorted(self.root.glob("*/config.json")):
            skill_dir = config_path.parent
            definition = self._load_skill(skill_dir)
            if definition.name in self._skills:
                raise ValueError(f"Skill 名称重复：{definition.name}")
            self._skills[definition.name] = definition

    def _load_skill(self, skill_dir: Path) -> SkillDefinition:
        config = json.loads((skill_dir / "config.json").read_text(encoding="utf-8"))
        skill_md = skill_dir / "SKILL.md"
        if not skill_md.exists():
            raise ValueError(f"Skill 缺少 SKILL.md：{skill_dir.name}")
        name = config.get("name") or skill_dir.name
        return SkillDefinition(
            name=name,
            description=str(config.get("description", "")),
            instructions=skill_md.read_text(encoding="utf-8").strip(),
            allowed_tools=tuple(config.get("allowed_tools") or []),
            max_tool_calls=int(config.get("max_tool_calls", 3)),
            output_actions=tuple(config.get("output_actions") or []),
        )

    def get(self, name: str) -> SkillDefinition:
        """按名称取 Skill；不存在时抛 KeyError。"""
        try:
            return self._skills[name]
        except KeyError:
            raise KeyError(f"未知 Skill：{name}")

    def list(self) -> list[SkillDefinition]:
        """返回所有 Skill（含 instructions）。"""
        return list(self._skills.values())

    @property
    def skill_names(self) -> tuple[str, ...]:
        """已加载的 Skill 名称列表。"""
        return tuple(self._skills.keys())
