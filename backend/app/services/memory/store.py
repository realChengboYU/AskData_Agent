"""
记忆存储原语（记忆文件夹 / Memory package）：
- 连接池（psycopg_pool.ConnectionPool）
- 短期记忆 checkpointer：langgraph-checkpoint-postgres 的 PostgresSaver
- 长期记忆 store：继承 langgraph.store.base.BaseStore 的 PostgresStore

数据库：本地 Docker 的 PostgreSQL（askdata_memory 库）。
"""

import json
import os
from typing import Any, Optional

from dotenv import load_dotenv

import langgraph.store.base as _base
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.store.base import BaseStore, Item, SearchItem
from psycopg_pool import ConnectionPool

# 命名空间各部分的分隔符（不会出现在业务字符串里的控制字符）
_SEP = "\x1f"

load_dotenv()  # 加载 backend/.env（DATABASE_URL）

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://askdata:askdata@localhost:5432/askdata_memory",
)

_pool: Optional[ConnectionPool] = None


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            DATABASE_URL,
            min_size=1,
            max_size=10,
            open=True,
            kwargs={"autocommit": True},
        )
    return _pool


def get_checkpointer() -> PostgresSaver:
    """短期记忆：LangGraph 会话状态 checkpointer（按 session_id 持久化多轮对话）。"""
    cp = PostgresSaver(get_pool())
    cp.setup()
    return cp


def get_connection():
    """便捷取一条池内连接（用于临时 SQL）。"""
    return get_pool().connection()


def _join(namespace: tuple[str, ...]) -> str:
    return _SEP.join(namespace)


class PostgresStore(BaseStore):
    """用一张 langgraph_store 表实现 LangGraph 的 BaseStore，做跨会话的长期记忆。"""

    def __init__(self) -> None:
        self.pool = get_pool()
        self._ensure_table()

    def _ensure_table(self) -> None:
        with self.pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS langgraph_store (
                        namespace  text        NOT NULL,
                        key        text        NOT NULL,
                        value      text        NOT NULL,  -- JSON 字符串
                        created_at timestamptz NOT NULL DEFAULT now(),
                        updated_at timestamptz NOT NULL DEFAULT now(),
                        PRIMARY KEY (namespace, key)
                    )
                    """
                )

    def get(
        self,
        namespace: tuple[str, ...],
        key: str,
        *,
        refresh_ttl: bool | None = None,
    ) -> Optional[Item]:
        with self.pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT namespace, key, value, created_at, updated_at "
                    "FROM langgraph_store WHERE namespace=%s AND key=%s",
                    [_join(namespace), key],
                )
                row = cur.fetchone()
        return self._to_item(row) if row else None

    def put(
        self,
        namespace: tuple[str, ...],
        key: str,
        value: dict[str, Any],
        index=None,
        *,
        ttl=None,
    ) -> None:
        with self.pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO langgraph_store(namespace, key, value) "
                    "VALUES(%s, %s, %s) "
                    "ON CONFLICT(namespace, key) "
                    "DO UPDATE SET value=EXCLUDED.value, updated_at=now()",
                    [_join(namespace), key, json.dumps(value, ensure_ascii=False)],
                )

    def delete(self, namespace: tuple[str, ...], key: str) -> None:
        with self.pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM langgraph_store WHERE namespace=%s AND key=%s",
                    [_join(namespace), key],
                )

    def search(
        self,
        namespace_prefix: tuple[str, ...],
        /,
        *,
        query: str | None = None,
        filter: Optional[dict[str, Any]] = None,
        limit: int = 10,
        offset: int = 0,
        refresh_ttl: bool | None = None,
    ) -> list[SearchItem]:
        prefix = _join(namespace_prefix)
        if prefix:
            where = "(namespace = %s OR namespace LIKE %s)"
            params: list[Any] = [prefix, prefix + _SEP + "%"]
        else:
            where = "true"
            params = []
        sql = (
            "SELECT namespace, key, value, created_at, updated_at "
            "FROM langgraph_store WHERE " + where + " "
            "ORDER BY updated_at DESC LIMIT %s OFFSET %s"
        )
        params += [limit, offset]
        with self.pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                rows = cur.fetchall()
        return [self._to_item(r, score=0.0) for r in rows]

    def list_namespaces(
        self,
        *,
        prefix: Optional[tuple[str, ...]] = None,
        suffix: Optional[tuple[str, ...]] = None,
        max_depth: int | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[tuple[str, ...]]:
        with self.pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT DISTINCT namespace FROM langgraph_store "
                    "ORDER BY namespace LIMIT %s OFFSET %s",
                    [limit, offset],
                )
                rows = cur.fetchall()
        return [tuple(r[0].split(_SEP)) for r in rows]

    def batch(self, ops):
        results = []
        for op in ops:
            if isinstance(op, _base.GetOp):
                results.append(self.get(op.namespace, op.key, refresh_ttl=op.refresh_ttl))
            elif isinstance(op, _base.PutOp):
                if op.value is None:
                    self.delete(op.namespace, op.key)
                else:
                    self.put(op.namespace, op.key, op.value, index=op.index, ttl=op.ttl)
                results.append(None)
            elif isinstance(op, _base.SearchOp):
                results.append(
                    self.search(
                        op.namespace_prefix,
                        query=op.query,
                        filter=op.filter,
                        limit=op.limit,
                        offset=op.offset,
                        refresh_ttl=op.refresh_ttl,
                    )
                )
            elif isinstance(op, _base.ListNamespacesOp):
                results.append(self.list_namespaces(limit=op.limit, offset=op.offset))
            else:
                results.append(None)
        return results

    async def abatch(self, ops):
        return self.batch(list(ops))

    def _to_item(self, row, score: Optional[float] = None) -> Item:
        namespace, key, value, created_at, updated_at = row
        kwargs = dict(
            namespace=tuple(namespace.split(_SEP)),
            key=key,
            value=json.loads(value),
            created_at=created_at,
            updated_at=updated_at,
        )
        if score is not None:
            return SearchItem(**kwargs, score=score)
        return Item(**kwargs)


_store: Optional[PostgresStore] = None


def get_store() -> PostgresStore:
    global _store
    if _store is None:
        _store = PostgresStore()
    return _store
