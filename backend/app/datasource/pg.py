"""PostgreSQL 数据源：从环境变量构建 PG 连接串并暴露 SQLDatabase 工具所需连接。

连接串只通过环境变量 `PG_CONNECTION_STRING` 提供（切勿写死到代码 / 提交进仓库）：
    postgresql+psycopg://USER:PASSWORD@HOST:PORT/DB

使用 SQLAlchemy 的 psycopg(v3) 驱动（`postgresql+psycopg://`），无需额外安装 psycopg2。

未配置 `PG_CONNECTION_STRING` 时本模块不抛错：连接串为空 → `get_pg_database` 返回
None → `get_sql_tools` 返回空列表，智能体退化为纯对话（SQL 工具不绑定）。
"""

import os
from typing import Optional

from langchain_community.utilities.sql_database import SQLDatabase


def resolve_pg_url(db_url: Optional[str] = None) -> Optional[str]:
    """按优先级解析 PG 连接串：显式传入 > 环境变量 PG_CONNECTION_STRING。"""
    if db_url:
        return db_url
    return os.getenv("PG_CONNECTION_STRING") or None


# PG 连接串（含敏感凭据）只从环境变量读取，代码中不落任何默认值，防止密钥进库。
PG_CONNECTION_STRING = os.getenv("PG_CONNECTION_STRING")


def get_pg_database(db_url: Optional[str] = None) -> Optional[SQLDatabase]:
    """构造指向 PG 数据源的 SQLDatabase；未配置或连接失败时返回 None。

    db_url 显式传入时优先于环境变量连接串。
    """
    from app.tools.SQLTools.sql_tools import get_sql_database

    return get_sql_database(resolve_pg_url(db_url))
