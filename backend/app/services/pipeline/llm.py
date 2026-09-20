"""LLM 工厂：读取 OpenAI 兼容配置；未配置 key 时返回 None（调用方降级提示）。

使用 langchain 的 ChatDeepSeek（而不是 base ChatOpenAI）：因为 base ChatOpenAI
只按官方 OpenAI 规范解析响应，不会提取第三方代理返回的非标准字段
`reasoning_content`（模型 thinking）。ChatDeepSeek 会把 thinking 归一化成
AIMessage.content_blocks 里的 `reasoning` 内容块，可随 llm.stream() 逐 chunks 拿到。
"""

import os
from typing import Optional

from dotenv import load_dotenv

load_dotenv()  # 加载 backend/.env（LLM 配置）

# 本环境的 HTTP 客户端（httpx2 / httpx）会在设置了代理相关环境变量时，因解析其中的
# IPv6 条目（NO_PROXY 里的 `::1,[::1]`）而崩溃（Invalid port）或无法直连内网 LLM。
# 这里在进程内清除代理环境变量，让 LLM 客户端直接访问内网模型服务（局域网，无需走系统代理）。
for _k in (
    "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY",
    "http_proxy", "https_proxy", "all_proxy",
    "NO_PROXY", "no_proxy",
):
    os.environ.pop(_k, None)


def _env() -> tuple:
    """读取（api_key, base_url, model）。"""
    api_key = os.getenv("LLM_API_KEY") or os.getenv("OPENAI_API_KEY") or os.getenv("DEEPSEEK_API_KEY")
    base_url = os.getenv("LLM_BASE_URL") or os.getenv("OPENAI_BASE_URL") or "https://api.openai.com/v1"
    model = os.getenv("LLM_MODEL") or os.getenv("LLM_MODEL_ID") or "gpt-4o-mini"
    return api_key, base_url, model


def get_llm() -> Optional["object"]:
    """构造 ChatDeepSeek（可提取 reasoning_content 为 content_blocks）。

    未配置 key 时返回 None（调用方降级提示）。
    """
    api_key, base_url, model = _env()
    if not api_key:
        return None
    try:
        from langchain_deepseek import ChatDeepSeek
    except Exception:  # pragma: no cover - 包未装时降级
        return None
    return ChatDeepSeek(
        model=model,
        api_key=api_key,
        base_url=base_url,
        temperature=0.7,
        timeout=120,
    )


def _blocks_to_text(blocks) -> tuple:
    """从 content_blocks 中拆分出 (answer, reasoning)。

    reasoning 块有 type=="reasoning" 且带 reasoning 字段；text 块 type=="text" 且带 text。
    """
    reasoning_parts: list[str] = []
    text_parts: list[str] = []
    for b in blocks or []:
        t = b.get("type") if isinstance(b, dict) else getattr(b, "type", None)
        if t == "reasoning":
            reasoning_parts.append(b.get("reasoning", "") if isinstance(b, dict) else getattr(b, "reasoning", ""))
        elif t == "text":
            text_parts.append(b.get("text", "") if isinstance(b, dict) else getattr(b, "text", ""))
    return "".join(text_parts), "".join(reasoning_parts)


def chat_completion(conversation: list, model: Optional[str] = None) -> dict:
    """一次多轮对话的 LLM 调用：用 llm.stream() 拿到 answer + thinking（reasoning_content）。

    返回 dict：{"content": str, "reasoning_content": str, "error": str|None}
    """
    try:
        from langchain_deepseek import ChatDeepSeek
    except Exception:
        return {"content": "（未安装 langchain-deepseek）", "reasoning_content": "", "error": None}

    api_key, base_url, _ = _env()
    if not api_key:
        return {"content": "（未配置 LLM：请在 backend/.env 设置 LLM_API_KEY）", "reasoning_content": "", "error": None}
    m = model or os.getenv("LLM_MODEL") or os.getenv("LLM_MODEL_ID") or "gpt-4o-mini"

    # 只把 role/content 传给 LLM，避免把历史里的 reasoning 字段混入请求
    messages = [
        {"role": r.get("role") if isinstance(r, dict) else "user",
         "content": (r.get("content") or "") if isinstance(r, dict) else str(r)}
        for r in conversation or []
    ]

    try:
        llm = ChatDeepSeek(model=m, api_key=api_key, base_url=base_url, temperature=0.7, timeout=120)
        text_parts: list[str] = []
        reasoning_parts: list[str] = []
        for chunk in llm.stream(messages):
            text, reasoning = _blocks_to_text(getattr(chunk, "content_blocks", None))
            text_parts.append(text)
            reasoning_parts.append(reasoning)
        return {"content": "".join(text_parts), "reasoning_content": "".join(reasoning_parts), "error": None}
    except Exception as exc:  # LLM 调用失败
        return {"content": "", "reasoning_content": "", "error": str(exc)}
