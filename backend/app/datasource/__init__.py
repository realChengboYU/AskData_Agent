"""datasource 包：数据源（Datasource）相关目录。

当前包含：
- pg：PostgreSQL 数据源连接串与 SQLDatabase 构造。

具体数据源能力（上传、解析、连接、元数据管理等）后续再扩展。
"""
from app.datasource.pg import PG_CONNECTION_STRING, get_pg_database

__all__ = ["PG_CONNECTION_STRING", "get_pg_database"]
