"""数据源管理接口：分开录入 PG 连接信息，服务端保存并拼接连接串。

- 列表 / 新建 / 更新 / 删除 / 测试连接 / 设为「使用中」。
- 列表不回传 password（仅测试 / 更新时可再次提供）。
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.routers.ask import get_user_key
from app.services import datasource_store as ds

router = APIRouter(prefix="/api", tags=["datasources"])


class DataSourceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    host: str = Field(..., min_length=1, max_length=255)
    port: int = Field(5432, ge=1, le=65535)
    dbname: str = Field(..., min_length=1, max_length=255)
    username: str = Field(..., min_length=1, max_length=255)
    password: str = Field("", max_length=255)


class DataSourceUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=80)
    host: Optional[str] = Field(None, max_length=255)
    port: Optional[int] = Field(None, ge=1, le=65535)
    dbname: Optional[str] = Field(None, max_length=255)
    username: Optional[str] = Field(None, max_length=255)
    # 留空表示不改密码
    password: Optional[str] = Field(None, max_length=255)


class TestIn(BaseModel):
    host: str = Field(..., min_length=1, max_length=255)
    port: int = Field(5432, ge=1, le=65535)
    dbname: str = Field(..., min_length=1, max_length=255)
    username: str = Field(..., min_length=1, max_length=255)
    password: str = Field("", max_length=255)


@router.get("/datasources")
def list_datasources(user_key: str = Depends(get_user_key)) -> dict:
    return {"sources": ds.list_sources(user_key)}


@router.post("/datasources", status_code=201)
def create_datasource(
    payload: DataSourceCreate, user_key: str = Depends(get_user_key)
) -> dict:
    sid = ds.create_source(
        user_key,
        payload.name.strip(),
        payload.host.strip(),
        payload.port,
        payload.dbname.strip(),
        payload.username.strip(),
        payload.password or "",
    )
    return {"id": sid}


@router.patch("/datasources/{source_id}")
def update_datasource(
    source_id: str, payload: DataSourceUpdate, user_key: str = Depends(get_user_key)
) -> dict:
    if ds.get_source(source_id, user_key) is None:
        raise HTTPException(status_code=404, detail="数据源不存在")
    ok = ds.update_source(source_id, user_key, payload.model_dump(exclude_none=True))
    return {"updated": ok}


@router.delete("/datasources/{source_id}")
def delete_datasource(source_id: str, user_key: str = Depends(get_user_key)) -> dict:
    ok = ds.delete_source(source_id, user_key)
    return {"deleted": ok}


@router.post("/datasources/{source_id}/active")
def set_active_datasource(
    source_id: str, user_key: str = Depends(get_user_key)
) -> dict:
    if ds.get_source(source_id, user_key) is None:
        raise HTTPException(status_code=404, detail="数据源不存在")
    ok = ds.set_active(source_id, user_key)
    return {"ok": ok, "active_id": source_id if ok else None}


@router.post("/datasources/{source_id}/test")
def test_datasource(
    source_id: str, user_key: str = Depends(get_user_key)
) -> dict:
    src = ds.get_source(source_id, user_key)
    if src is None:
        raise HTTPException(status_code=404, detail="数据源不存在")
    ok, message = ds.test_connection(
        src["host"], src["port"], src["dbname"], src["username"], src["password"]
    )
    return {"ok": ok, "message": message}


@router.post("/datasources/test")
def test_datasource_raw(payload: TestIn) -> dict:
    """按表单当前值测试（保存前即可试连）。不要求登录，凭据仅用于本次连接。"""
    ok, message = ds.test_connection(
        payload.host.strip(), payload.port, payload.dbname.strip(),
        payload.username.strip(), payload.password or "",
    )
    return {"ok": ok, "message": message}
