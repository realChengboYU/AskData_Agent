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
    description: str = Field("", max_length=512)


class DataSourceUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=80)
    host: Optional[str] = Field(None, max_length=255)
    port: Optional[int] = Field(None, ge=1, le=65535)
    dbname: Optional[str] = Field(None, max_length=255)
    username: Optional[str] = Field(None, max_length=255)
    # 留空表示不改密码
    password: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = Field(None, max_length=512)


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
        payload.description or "",
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


# ---------------------------------------------------------------------------
# 策展：连目标库读元数据（表/字段/预览）+ 保存选中的表和注释
# ---------------------------------------------------------------------------

class TableIn(BaseModel):
    table_name: str = Field(..., min_length=1, max_length=255)
    table_comment: Optional[str] = ""
    custom_comment: Optional[str] = ""
    checked: bool = True


class SaveTablesIn(BaseModel):
    tables: list[TableIn]


class UpdateTableIn(BaseModel):
    custom_comment: Optional[str] = None
    checked: Optional[bool] = None


def _get_owned(source_id: str, user_key: str) -> dict:
    src = ds.get_source(source_id, user_key)
    if src is None:
        raise HTTPException(status_code=404, detail="数据源不存在")
    return src


@router.get("/datasources/{source_id}/tables")
def list_curated_tables(source_id: str, user_key: str = Depends(get_user_key)) -> dict:
    """返回该数据源已策展（选中/可编辑）的表。"""
    _get_owned(source_id, user_key)
    return {"tables": ds.get_tables(source_id)}


@router.put("/datasources/{source_id}/tables")
def save_curated_tables(
    source_id: str,
    payload: SaveTablesIn,
    user_key: str = Depends(get_user_key),
) -> dict:
    """全量保存该数据源选中的表 + 注释。"""
    _get_owned(source_id, user_key)
    n = ds.save_tables(source_id, [t.model_dump() for t in payload.tables])
    return {"saved": len(payload.tables), "checked": n}


@router.patch("/datasources/{source_id}/tables/{table_name}")
def update_curated_table(
    source_id: str,
    table_name: str,
    payload: UpdateTableIn,
    user_key: str = Depends(get_user_key),
) -> dict:
    """更新某张表的自定义注释 / 是否启用。"""
    _get_owned(source_id, user_key)
    ok = ds.update_table(
        source_id, table_name,
        custom_comment=payload.custom_comment, checked=payload.checked,
    )
    return {"updated": ok}


@router.post("/datasources/{source_id}/introspect/tables")
def introspect_tables(source_id: str, user_key: str = Depends(get_user_key)) -> dict:
    """连目标库，列出 public 下的表（表名 + 注释）。"""
    src = _get_owned(source_id, user_key)
    try:
        tables = ds.list_target_tables(
            src["host"], src["port"], src["dbname"], src["username"], src["password"]
        )
    except Exception as exc:
        msg = str(exc).strip().splitlines()[0] if str(exc).strip() else type(exc).__name__
        raise HTTPException(status_code=502, detail=f"读取目标库失败：{msg[:160]}")
    return {"tables": tables}


@router.post("/datasources/{source_id}/introspect/fields/{table_name}")
def introspect_fields(
    source_id: str, table_name: str, user_key: str = Depends(get_user_key)
) -> dict:
    """连目标库，列出某表的字段（字段名 + 类型）。"""
    src = _get_owned(source_id, user_key)
    try:
        fields = ds.list_target_fields(
            src["host"], src["port"], src["dbname"], src["username"], src["password"],
            table_name,
        )
    except Exception as exc:
        msg = str(exc).strip().splitlines()[0] if str(exc).strip() else type(exc).__name__
        raise HTTPException(status_code=502, detail=f"读取字段失败：{msg[:160]}")
    return {"fields": fields}


@router.post("/datasources/{source_id}/introspect/preview/{table_name}")
def introspect_preview(
    source_id: str,
    table_name: str,
    user_key: str = Depends(get_user_key),
    limit: int = 10,
) -> dict:
    """连目标库，预览某表前 N 行。"""
    src = _get_owned(source_id, user_key)
    try:
        return ds.preview_target_data(
            src["host"], src["port"], src["dbname"], src["username"], src["password"],
            table_name, limit,
        )
    except Exception as exc:
        msg = str(exc).strip().splitlines()[0] if str(exc).strip() else type(exc).__name__
        raise HTTPException(status_code=502, detail=f"预览失败：{msg[:160]}")
