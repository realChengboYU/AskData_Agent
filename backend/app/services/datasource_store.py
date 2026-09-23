"""数据源存储与连接串拼接。

把用户在界面里分开录入的 PostgreSQL 连接信息（名称/地址/端口/数据库/用户名/密码）
存进记忆库（askdata_memory）的 `data_sources` 表，按需拼接成
`postgresql+psycopg://USER:PASSWORD@HOST:PORT/DB` 连接串供 SQL 工具使用。

- 凭据只在服务端保存；接口列表不回传 `password`。
- 每个登录用户（按 user_key，即登录邮箱）各自管理自己的数据源。
- `get_active_db_url` 返回该用户标记为「使用中」的数据源连接串（供智能体查询用）。
"""

import uuid
from typing import Any, Optional
from urllib.parse import quote

from app.services.memory.store import get_pool

_TABLE = "data_sources"

_SELECT_COLS = (
    "id, user_key, name, host, port, dbname, username, password, "
    "is_active, created_at, updated_at"
)


def _ensure_table() -> None:
    """确保 data_sources 表存在（幂等）。"""
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                CREATE TABLE IF NOT EXISTS {_TABLE} (
                    id         text        PRIMARY KEY,
                    user_key   text        NOT NULL DEFAULT 'anonymous',
                    name       text        NOT NULL,
                    host       text        NOT NULL,
                    port       integer     NOT NULL DEFAULT 5432,
                    dbname     text        NOT NULL,
                    username   text        NOT NULL,
                    password   text        NOT NULL,
                    is_active  boolean     NOT NULL DEFAULT false,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    updated_at timestamptz NOT NULL DEFAULT now()
                )
                """
            )


def build_pg_url(
    host: str,
    port: int,
    dbname: str,
    username: str,
    password: str,
) -> str:
    """把分开录入的字段拼成 PG 连接串（用户名/密码做 URL 转义）。"""
    u = quote(str(username or ""), safe="")
    p = quote(str(password or ""), safe="")
    return f"postgresql+psycopg://{u}:{p}@{host}:{int(port)}/{dbname}"


def _row_to_public(row: tuple, include_password: bool = False) -> dict:
    (
        _id, _user, name, host, port, dbname, username, password,
        is_active, created_at, updated_at,
    ) = row
    d: dict[str, Any] = {
        "id": _id,
        "name": name,
        "host": host,
        "port": port,
        "dbname": dbname,
        "username": username,
        "is_active": bool(is_active),
        "created_at": created_at.isoformat() if created_at else None,
        "updated_at": updated_at.isoformat() if updated_at else None,
    }
    if include_password:
        d["password"] = password
    return d


def list_sources(user_key: str) -> list[dict]:
    _ensure_table()
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT {_SELECT_COLS} FROM {_TABLE} WHERE user_key=%s "
                "ORDER BY is_active DESC, updated_at DESC",
                [user_key],
            )
            rows = cur.fetchall()
    return [_row_to_public(r) for r in rows]


def get_source(source_id: str, user_key: str) -> Optional[dict]:
    _ensure_table()
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT {_SELECT_COLS} FROM {_TABLE} WHERE id=%s AND user_key=%s",
                [source_id, user_key],
            )
            row = cur.fetchone()
    return _row_to_public(row, include_password=True) if row else None


def create_source(
    user_key: str,
    name: str,
    host: str,
    port: int,
    dbname: str,
    username: str,
    password: str,
) -> str:
    _ensure_table()
    sid = uuid.uuid4().hex
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"INSERT INTO {_TABLE} "
                "(id, user_key, name, host, port, dbname, username, password) "
                "VALUES(%s, %s, %s, %s, %s, %s, %s, %s)",
                [sid, user_key, name, host, int(port), dbname, username, password],
            )
    return sid


def update_source(source_id: str, user_key: str, fields: dict) -> bool:
    """按提供的字段更新（只更新非 None 的字段）。返回是否更新到行。"""
    _ensure_table()
    allowed = {"name", "host", "port", "dbname", "username", "password"}
    sets: list[str] = []
    vals: list[Any] = []
    for k, v in fields.items():
        if k in allowed and v is not None:
            sets.append(f"{k}=%s")
            vals.append(int(v) if k == "port" else v)
    if not sets:
        return get_source(source_id, user_key) is not None
    sets.append("updated_at=now()")
    vals += [source_id, user_key]
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE {_TABLE} SET {', '.join(sets)} WHERE id=%s AND user_key=%s",
                vals,
            )
            return (cur.rowcount or 0) > 0
    return False


def delete_source(source_id: str, user_key: str) -> bool:
    _ensure_table()
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"DELETE FROM {_TABLE} WHERE id=%s AND user_key=%s",
                [source_id, user_key],
            )
            return (cur.rowcount or 0) > 0
    return False


def set_active(source_id: str, user_key: str) -> bool:
    """把某数据源设为该用户的「使用中」（并清除该用户其它源的激活标记）。"""
    _ensure_table()
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE {_TABLE} SET is_active=false, updated_at=now() "
                "WHERE user_key=%s AND is_active=true",
                [user_key],
            )
            cur.execute(
                f"UPDATE {_TABLE} SET is_active=true, updated_at=now() "
                "WHERE id=%s AND user_key=%s",
                [source_id, user_key],
            )
            return (cur.rowcount or 0) > 0
    return False


def get_active_db_url(user_key: str) -> Optional[str]:
    """返回该用户「使用中」数据源的 PG 连接串；没有则返回 None。"""
    _ensure_table()
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT host, port, dbname, username, password FROM {_TABLE} "
                "WHERE user_key=%s AND is_active=true LIMIT 1",
                [user_key],
            )
            row = cur.fetchone()
    if not row:
        return None
    host, port, dbname, username, password = row
    return build_pg_url(host, port, dbname, username, password)


def test_connection(
    host: str,
    port: int,
    dbname: str,
    username: str,
    password: str,
    timeout: int = 6,
) -> tuple[bool, str]:
    """用给定凭据连接目标 PG，成功则返回 (True, 概要)，失败返回 (False, 原因)。"""
    url = build_pg_url(host, port, dbname, username, password)
    engine = None
    try:
        from sqlalchemy import create_engine, text

        engine = create_engine(url, connect_args={"connect_timeout": timeout})
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            try:
                n = conn.execute(
                    text(
                        "SELECT count(*) FROM information_schema.tables "
                        "WHERE table_schema='public'"
                    )
                ).scalar()
            except Exception:
                n = "?"
        return True, f"连接成功 · public 下 {n} 张表"
    except Exception as exc:  # 连接失败（网络/认证/库不存在等）
        msg = str(exc).strip().splitlines()[0] if str(exc).strip() else type(exc).__name__
        return False, f"连接失败：{msg[:160]}"
    finally:
        if engine is not None:
            try:
                engine.dispose()
            except Exception:
                pass
