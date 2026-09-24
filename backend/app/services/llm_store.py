"""LLM 配置存储：让登录用户在「设置」里配置对话模型（Base URL / 名称 / API Key）。

- 按 user_key（登录邮箱）各自存一份；未配置时回退到 backend/.env 的 LLM 配置。
- API Key 复用数据源凭据加密（credential_crypto）AES-GCM 落库，接口只回传打码值。
- 提供「测试连接」：用给定配置发一次最小 LLM 调用验证连通性。
"""

from __future__ import annotations

import os
from typing import Optional

from app.services.credential_crypto import decrypt, encrypt
from app.services.memory.store import get_pool

_TABLE = "llm_configs"


def _ensure_table() -> None:
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {_TABLE} (
                    user_key   text        PRIMARY KEY,
                    base_url   text,
                    model      text,
                    api_key    text,
                    updated_at timestamptz NOT NULL DEFAULT now()
                )
                """
            )


def _env_fallback() -> tuple:
    """backend/.env 的 LLM 配置（未登录用户界面配置时的回退）。返回 (api_key|None, base_url, model)。"""
    api_key = os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY") or os.getenv("DEEPSEEK_API_KEY")
    base_url = os.getenv("LLM_BASE_URL") or os.getenv("OPENAI_BASE_URL") or "https://api.openai.com/v1"
    model = os.getenv("LLM_MODEL") or os.getenv("LLM_MODEL_ID") or "gpt-4o-mini"
    return (api_key or None), base_url, model


def get_llm_config(user_key: str) -> Optional[dict]:
    """返回该用户已存的模型配置（api_key 解密）；没有则返回 None。"""
    _ensure_table()
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT base_url, model, api_key FROM {_TABLE} WHERE user_key=%s",
                [user_key],
            )
            row = cur.fetchone()
    if not row:
        return None
    base_url, model, api_key = row
    return {
        "base_url": base_url or "",
        "model": model or "",
        "api_key": decrypt(api_key) if api_key else "",
    }


def set_llm_config(
    user_key: str,
    base_url: Optional[str] = None,
    model: Optional[str] = None,
    api_key: Optional[str] = None,
) -> bool:
    """保存该用户的模型配置（upsert）。空字段保留已有值（api_key 留空则不改动已有 Key）。"""
    _ensure_table()
    cur = get_llm_config(user_key) or {}
    final_base = (base_url or "").strip() or (cur.get("base_url") or "")
    final_model = (model or "").strip() or (cur.get("model") or "")
    final_key = (api_key or "").strip() or (cur.get("api_key") or "")
    with get_pool().connection() as conn:
        with conn.cursor() as cur2:
            cur2.execute(
                f"INSERT INTO {_TABLE} (user_key, base_url, model, api_key, updated_at) "
                "VALUES(%s, %s, %s, %s, now()) "
                "ON CONFLICT (user_key) DO UPDATE SET "
                "base_url=EXCLUDED.base_url, model=EXCLUDED.model, "
                "api_key=EXCLUDED.api_key, updated_at=now()",
                [user_key, final_base, final_model, encrypt(final_key) if final_key else ""],
            )
    return True


def resolve_llm_config(user_key: Optional[str] = None) -> tuple:
    """解析 (api_key|None, base_url, model)：优先该用户界面里配置的，其次 backend/.env。"""
    if user_key:
        cfg = get_llm_config(user_key)
        if cfg and (cfg.get("api_key") or cfg.get("model") or cfg.get("base_url")):
            env_key, env_base, env_model = _env_fallback()
            return (
                cfg.get("api_key") or env_key,
                cfg.get("base_url") or env_base,
                cfg.get("model") or env_model,
            )
    return _env_fallback()


def mask_key(key: Optional[str]) -> str:
    """把 Key 打码：前3 + 8 个占位 + 后4；太短则全占位。"""
    k = (key or "").strip()
    if not k:
        return ""
    if len(k) <= 8:
        return "•" * len(k)
    return f"{k[:3]}{'•' * 8}{k[-4:]}"


def _one_line(exc: Exception) -> str:
    m = str(exc).strip().splitlines()[0] if str(exc).strip() else type(exc).__name__
    return m[:160]


def _http_detail(r) -> str:
    try:
        j = r.json()
        return str((j.get("error") or {}).get("message") or j.get("message") or r.text).strip()[:160]
    except Exception:
        return str(r.text).strip()[:160]


def test_llm_config(base_url: str, model: str, api_key: str) -> tuple:
    """验证模型服务连通性，返回 (ok, message)。

    优先 `GET {base}/models`（不跑模型，最快最稳，验证地址 + 鉴权）；
    不支持 /models 的服务回退到一次 `max_tokens=1` 的最小补全。
    """
    base_url = (base_url or "").strip() or "https://api.openai.com/v1"
    model = (model or "").strip()
    api_key = (api_key or "").strip()
    if not api_key:
        return False, "缺少 API Key"
    import httpx

    headers = {"Authorization": "Bearer " + api_key}
    root = base_url.rstrip("/")
    # trust_env=False：直连、忽略系统 / 环境变量代理（内网模型服务不经代理）
    try:
        with httpx.Client(timeout=15, trust_env=False) as client:
            r = client.get(root + "/models", headers=headers)
    except Exception as exc:
        return False, f"连接失败：{_one_line(exc)}"

    if r.status_code == 200:
        try:
            ids = [m.get("id") for m in r.json().get("data", []) if isinstance(m, dict)]
        except Exception:
            ids = []
        if model and ids and model not in ids:
            return True, f"连接成功（服务可达；但模型 {model} 不在列表，请核对名称）"
        return True, f"连接成功 · {model or '模型服务'} 可达"
    if r.status_code in (404, 405):
        # 不支持 /models：回退到最小补全
        if not model:
            return False, "缺少模型名称"
        try:
            with httpx.Client(timeout=30, trust_env=False) as client:
                r2 = client.post(
                    root + "/chat/completions",
                    json={"model": model, "messages": [{"role": "user", "content": "hi"}], "max_tokens": 1},
                    headers=headers,
                )
            if r2.status_code == 200:
                return True, f"连接成功 · 模型 {model} 响应正常"
            return False, f"连接失败（HTTP {r2.status_code}）：{_http_detail(r2)}"
        except Exception as exc:
            return False, f"连接失败：{_one_line(exc)}"
    return False, f"连接失败（HTTP {r.status_code}）：{_http_detail(r)}"
