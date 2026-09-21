"""Skills 模块：能力契约（config.json + SKILL.md）的加载与访问。

- registry.SkillDefinition：一个 Skill 的不可变能力契约。
- registry.SkillRegistry：扫描 skills/ 目录并加载 / 校验所有 Skill。
- registry 单例：进程内共享的 SkillRegistry（启动时加载一次）。
- get_skill_context：取某 Skill 的指令与工具面（供查询链路注入 / 收敛工具）。
"""

from typing import Optional

from app.skills.registry import (
    SKILLS_DIR,
    SkillDefinition,
    SkillRegistry,
)

# 进程内单例：应用启动即扫描 app/skills/ 加载全部 Skill。
registry = SkillRegistry()


def get_skill(name: str) -> SkillDefinition:
    """按名称取 Skill；不存在时抛 KeyError。"""
    return registry.get(name)


def get_skill_context(
    name: str = "database_query",
) -> tuple[Optional[str], Optional[list[str]]]:
    """返回某 Skill 的 (instructions, allowed_tools)。

    供查询链路在「注入 system 指令」与「收敛工具面」时使用。
    Skill 不存在或目录异常时安全返回 (None, None)，调用方回退到默认行为。
    """
    try:
        skill = registry.get(name)
        return skill.instructions, list(skill.allowed_tools)
    except Exception:
        return None, None


__all__ = [
    "SKILLS_DIR",
    "SkillDefinition",
    "SkillRegistry",
    "registry",
    "get_skill",
    "get_skill_context",
]
