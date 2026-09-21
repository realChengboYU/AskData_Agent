"""Skills 路由：暴露当前启用的应用级 Skill 能力面（不含完整指令文本）。

- GET /api/skills      ：列出所有 Skill（name / description / allowed_tools / max_tool_calls / output_actions）
- GET /api/skills/{name}：按名称取单个 Skill 的能力面

用于前端「能力 / 工具面」展示，以及调试时确认 Skill 是否正确加载。
"""

from fastapi import APIRouter, HTTPException

from app.skills import registry

router = APIRouter(prefix="/api", tags=["skills"])


@router.get("/skills")
def list_skills() -> list[dict]:
    """查看当前启用的所有 Skill 的能力面（剔除 instructions）。"""
    return [skill.public() for skill in registry.list()]


@router.get("/skills/{name}")
def get_skill(name: str) -> dict:
    """按名称查看单个 Skill 的能力面。"""
    try:
        return registry.get(name).public()
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
