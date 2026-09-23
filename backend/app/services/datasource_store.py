"""数据源存储与连接串拼接。

把用户在界面里分开录入的 PostgreSQL 连接信息（名称/地址/端口/数据库/用户名/密码）
存进记忆库（askdata_memory）的 `data_sources` 表，按需拼接成
`postgresql+psycopg://USER:PASSWORD@HOST:PORT/DB` 连接串供 SQL 工具使用。

- 凭据只在服务端保存；接口列表不回传 `password`。
- `password` 落库前用服务端密钥 AES-GCM 加密（见 credential_crypto），历史明文自动兼容。
- 每个登录用户（按 user_key，即登录邮箱）各自管理自己的数据源。
- `get_active_db_url` 返回该用户标记为「使用中」的数据源连接串（供智能体查询用）。
"""

import uuid
from typing import Any, Optional
from urllib.parse import quote

from app.services.credential_crypto import decrypt, encrypt
from app.services.memory.store import get_pool

_TABLE = "data_sources"

_SELECT_COLS = (
    "id, user_key, name, host, port, dbname, username, password, "
    "is_active, description, num, created_at, updated_at"
)


def _ensure_table() -> None:
    """确保 data_sources + data_source_tables 表存在（幂等，含旧库增量列）。"""
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
            # 旧库升级：增量补列（IF NOT EXISTS 幂等）
            cur.execute(f"ALTER TABLE {_TABLE} ADD COLUMN IF NOT EXISTS description text")
            cur.execute(f"ALTER TABLE {_TABLE} ADD COLUMN IF NOT EXISTS num integer NOT NULL DEFAULT 0")
            # 策展表：某数据源下被选中/可编辑的表 + 表注释 + 自定义注释
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS data_source_tables (
                    ds_id          text        NOT NULL,
                    table_name     text        NOT NULL,
                    table_comment  text,
                    custom_comment text,
                    checked        boolean     NOT NULL DEFAULT true,
                    created_at     timestamptz NOT NULL DEFAULT now(),
                    updated_at     timestamptz NOT NULL DEFAULT now(),
                    PRIMARY KEY (ds_id, table_name)
                )
                """
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS idx_data_source_tables_ds "
                "ON data_source_tables (ds_id)"
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
        is_active, description, num, created_at, updated_at,
    ) = row
    d: dict[str, Any] = {
        "id": _id,
        "name": name,
        "host": host,
        "port": port,
        "dbname": dbname,
        "username": username,
        "is_active": bool(is_active),
        "description": description or "",
        "num": num or 0,
        "created_at": created_at.isoformat() if created_at else None,
        "updated_at": updated_at.isoformat() if updated_at else None,
    }
    if include_password:
        d["password"] = decrypt(password)
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
    description: str = "",
) -> str:
    _ensure_table()
    sid = uuid.uuid4().hex
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"INSERT INTO {_TABLE} "
                "(id, user_key, name, host, port, dbname, username, password, description) "
                "VALUES(%s, %s, %s, %s, %s, %s, %s, %s, %s)",
                [sid, user_key, name, host, int(port), dbname, username,
                 encrypt(password), description or ""],
            )
    return sid


def update_source(source_id: str, user_key: str, fields: dict) -> bool:
    """按提供的字段更新（只更新非 None 的字段）。返回是否更新到行。"""
    _ensure_table()
    allowed = {"name", "host", "port", "dbname", "username", "password", "description"}
    sets: list[str] = []
    vals: list[Any] = []
    for k, v in fields.items():
        if k in allowed and v is not None:
            sets.append(f"{k}=%s")
            if k == "password":
                vals.append(encrypt(v))
            elif k == "port":
                vals.append(int(v))
            else:
                vals.append(v)
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
            deleted = (cur.rowcount or 0) > 0
            if deleted:
                cur.execute("DELETE FROM data_source_tables WHERE ds_id=%s", [source_id])
            return deleted
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
    return build_pg_url(host, port, dbname, username, decrypt(password))


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


# ---------------------------------------------------------------------------
# 策展表（data_source_tables）：某数据源下被选中/可编辑的表 + 注释
# ---------------------------------------------------------------------------

def get_tables(ds_id: str) -> list[dict]:
    """返回某数据源已策展的表（表名 / 表注释 / 自定义注释 / 是否启用）。"""
    _ensure_table()
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT table_name, table_comment, custom_comment, checked "
                "FROM data_source_tables WHERE ds_id=%s ORDER BY table_name",
                [ds_id],
            )
            rows = cur.fetchall()
    return [
        {
            "table_name": a,
            "table_comment": b or "",
            "custom_comment": c or "",
            "checked": bool(d),
        }
        for a, b, c, d in rows
    ]


def save_tables(ds_id: str, tables: list[dict]) -> int:
    """全量替换某数据源的策展表。

    ``tables``: [{"table_name", "table_comment"?, "custom_comment"?, "checked"?}]。
    同时把 data_sources.num 更新为选中（checked=true）的表数。
    """
    _ensure_table()
    checked_n = 0
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM data_source_tables WHERE ds_id=%s", [ds_id])
            for t in tables:
                name = str(t.get("table_name") or "").strip()
                if not name:
                    continue
                checked = bool(t.get("checked", True))
                checked_n += 1 if checked else 0
                cur.execute(
                    "INSERT INTO data_source_tables "
                    "(ds_id, table_name, table_comment, custom_comment, checked) "
                    "VALUES(%s, %s, %s, %s, %s) "
                    "ON CONFLICT (ds_id, table_name) DO UPDATE SET "
                    "table_comment=EXCLUDED.table_comment, "
                    "custom_comment=EXCLUDED.custom_comment, "
                    "checked=EXCLUDED.checked, updated_at=now()",
                    [ds_id, name, t.get("table_comment") or "",
                     t.get("custom_comment") or "", checked],
                )
            cur.execute(
                f"UPDATE {_TABLE} SET num=%s, updated_at=now() WHERE id=%s",
                [checked_n, ds_id],
            )
    return checked_n


def update_table(
    ds_id: str,
    table_name: str,
    custom_comment: Optional[str] = None,
    checked: Optional[bool] = None,
) -> bool:
    """更新某张表的自定义注释 / 是否启用（仅更新非 None 项）。"""
    _ensure_table()
    sets: list[str] = []
    vals: list[Any] = []
    if custom_comment is not None:
        sets.append("custom_comment=%s")
        vals.append(custom_comment)
    if checked is not None:
        sets.append("checked=%s")
        vals.append(bool(checked))
    if not sets:
        return False
    sets.append("updated_at=now()")
    vals += [ds_id, table_name]
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE data_source_tables SET " + ", ".join(sets) +
                " WHERE ds_id=%s AND table_name=%s",
                vals,
            )
            return (cur.rowcount or 0) > 0
    return False


def delete_tables(ds_id: str) -> int:
    """删除某数据源的全部策展表，并把 data_sources.num 归零。"""
    _ensure_table()
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM data_source_tables WHERE ds_id=%s", [ds_id])
            n = cur.rowcount or 0
            cur.execute(
                f"UPDATE {_TABLE} SET num=0, updated_at=now() WHERE id=%s", [ds_id]
            )
    return n


# ---------------------------------------------------------------------------
# 目标库内省：连到用户配置的业务库，读元数据（表 / 字段 / 预览）
# ---------------------------------------------------------------------------

def _target_engine(host: str, port: int, dbname: str, username: str, password: str):
    from sqlalchemy import create_engine

    url = build_pg_url(host, port, dbname, username, password)
    return create_engine(url, connect_args={"connect_timeout": 8})


def _coerce(value: Any) -> Any:
    """把库里取出的值转成可 JSON 序列化（日期/Decimal 等 → 字符串）。"""
    if value is None or isinstance(value, (int, float, str, bool)):
        return value
    return str(value)


def list_target_tables(
    host: str, port: int, dbname: str, username: str, password: str, limit: int = 1000
) -> list[dict]:
    """列出目标库 public 下的表（表名 + 表注释），返回 [{table_name, table_comment}]。"""
    engine = None
    try:
        from sqlalchemy import text

        engine = _target_engine(host, port, dbname, username, password)
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT c.relname, COALESCE(d.description, '') "
                    "FROM pg_class c "
                    "JOIN pg_namespace n ON n.oid = c.relnamespace "
                    "LEFT JOIN pg_description d ON d.objoid = c.oid AND d.objsubid = 0 "
                    "WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m') "
                    "ORDER BY c.relname LIMIT " + str(max(1, min(int(limit), 2000)))
                )
            ).fetchall()
        return [{"table_name": r[0], "table_comment": r[1] or ""} for r in rows]
    finally:
        if engine is not None:
            try:
                engine.dispose()
            except Exception:
                pass


def list_target_fields(
    host: str, port: int, dbname: str, username: str, password: str, table_name: str
) -> list[dict]:
    """列出某表的字段（字段名 + 类型），返回 [{field_name, field_type}]。"""
    engine = None
    try:
        from sqlalchemy import text

        engine = _target_engine(host, port, dbname, username, password)
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    "SELECT column_name, data_type "
                    "FROM information_schema.columns "
                    "WHERE table_schema='public' AND table_name=:t "
                    "ORDER BY ordinal_position"
                ),
                {"t": table_name},
            ).fetchall()
        return [{"field_name": r[0], "field_type": r[1] or ""} for r in rows]
    finally:
        if engine is not None:
            try:
                engine.dispose()
            except Exception:
                pass


def preview_target_data(
    host: str,
    port: int,
    dbname: str,
    username: str,
    password: str,
    table_name: str,
    limit: int = 10,
) -> dict:
    """预览某表前 N 行，返回 {columns: [...], rows: [[...], ...]}。"""
    limit = max(1, min(int(limit), 200))
    # 表名作为标识符：双引号包裹并转义内部引号（表名来自内省列表，仍做防御）
    ident = '"' + str(table_name).replace('"', '""') + '"'
    engine = None
    try:
        from sqlalchemy import text

        engine = _target_engine(host, port, dbname, username, password)
        with engine.connect() as conn:
            result = conn.execute(text(f"SELECT * FROM public.{ident} LIMIT {limit}"))
            columns = list(result.keys())
            rows = [[_coerce(v) for v in rec] for rec in result.fetchall()]
        return {"columns": columns, "rows": rows}
    finally:
        if engine is not None:
            try:
                engine.dispose()
            except Exception:
                pass
