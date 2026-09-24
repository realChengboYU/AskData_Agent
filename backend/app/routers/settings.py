from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.routers.ask import get_user_key
from app.services import llm_store

router = APIRouter(prefix="/api", tags=["settings"])


class LlmConfigRequest(BaseModel):
    base_url: Optional[str] = None
    model: Optional[str] = None
    api_key: Optional[str] = None


@router.get("/settings/llm")
def get_llm(user_key: str = Depends(get_user_key)):
    """读取当前用户生效的对话模型配置：base_url/model 回退到 backend/.env；Key 只回打码值。"""
    cfg = llm_store.get_llm_config(user_key) or {}
    env_key, env_base, env_model = llm_store._env_fallback()
    stored_key = cfg.get("api_key") or ""
    return {
        "base_url": cfg.get("base_url") or env_base,
        "model": cfg.get("model") or env_model,
        "has_key": bool(stored_key or env_key),
        "key_masked": llm_store.mask_key(stored_key) if stored_key else "",
    }


@router.put("/settings/llm")
def save_llm(payload: LlmConfigRequest, user_key: str = Depends(get_user_key)):
    """保存对话模型配置（base_url / model / api_key）；api_key 留空则保留已有。"""
    ok = llm_store.set_llm_config(user_key, payload.base_url, payload.model, payload.api_key)
    return {"ok": ok, "saved": ok}


@router.post("/settings/llm/test")
def test_llm(payload: LlmConfigRequest, user_key: str = Depends(get_user_key)):
    """测试对话模型连接（不保存）；空字段回退到「已存配置 / backend/.env」。"""
    stored = llm_store.get_llm_config(user_key) or {}
    env_key, env_base, env_model = llm_store._env_fallback()
    base = (payload.base_url or "").strip() or stored.get("base_url") or env_base
    model = (payload.model or "").strip() or stored.get("model") or env_model
    key = (payload.api_key or "").strip() or stored.get("api_key") or env_key
    ok, msg = llm_store.test_llm_config(base, model, key)
    return {"ok": ok, "message": msg}
