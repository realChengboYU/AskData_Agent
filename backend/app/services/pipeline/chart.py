"""数据可视化模型工具：让模型在拿到表格/聚合数据后调用 `render_chart` 生成图表。

图表走「结构化 spec + 前端拼 ECharts option」：
  spec = {chartType: bar|line|pie, title, categories, series:[{name,data}], xName, yName, area}

与 clarify 一样，render_chart 由流程拦截（记录 spec 并产出 chart 事件），不真正执行。
"""

import ast
import re

from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

RENDER_CHART_NAME = "render_chart"
CHART_SENTINEL = "__CHART_REQUESTED__"


class ChartSeries(BaseModel):
    name: str = Field("", description="系列名称")
    data: list = Field(default_factory=list, description="系列数值，与 categories 等长")


class ChartInput(BaseModel):
    chartType: str = Field(
        "bar",
        description="图表类型：bar（分类对比）/ line（趋势、时间序列，可 fill 面积）/ pie（占比）。",
    )
    title: str = Field("", description="图表标题")
    categories: list = Field(default_factory=list, description="分类/横轴标签（bar/line），或饼图扇区名（pie）")
    series: list[ChartSeries] = Field(default_factory=list, description="一个或多个系列")
    xName: str = Field("", description="横轴名称（bar/line）")
    yName: str = Field("", description="纵轴名称（bar/line）")
    area: bool = Field(False, description="折线是否填充面积，仅 line 有效")


def _chart_fn(
    chartType: str = "bar",
    title: str = "",
    categories: list = None,
    series: list = None,
    xName: str = "",
    yName: str = "",
    area: bool = False,
) -> str:
    # 正常由流程拦截，不真正执行
    return CHART_SENTINEL


def make_chart_tool() -> StructuredTool:
    """构造图表工具：模型拿到数据后调用，流程拦截其调用以产出 chart 事件。"""
    return StructuredTool.from_function(
        func=_chart_fn,
        name=RENDER_CHART_NAME,
        description=(
            "当你拿到一份表格/聚合数据并希望可视化时调用它。"
            "分类对比用 bar；趋势/时间序列用 line（area=True 填充面积）；占比用 pie。"
            "给出标题、类别（categories）与数值（series）；调用后你仍会用文字解读结果。"
        ),
        args_schema=ChartInput,
    )


def is_chart_call(call: dict) -> bool:
    return (call.get("name") or "") == RENDER_CHART_NAME


def normalize_chart_spec(spec) -> dict | None:
    """规整模型产出的图表 spec：数字串转成数值、补齐 title/series、剔除空系列。"""
    if not isinstance(spec, dict):
        return None
    st = spec.get("chartType")
    if st not in ("bar", "line", "pie"):
        return None
    categories = [str(c) for c in (spec.get("categories") or [])]
    series_raw = spec.get("series") or []
    series = []
    # 常见容错：series 直接是 ["a","b"] / [1,2] 这类扁平值 → 当作单系列
    if not isinstance(series_raw, list):
        series_raw = [series_raw]
    for s in series_raw:
        if isinstance(s, dict):
            if "data" not in s:
                continue
            data = [_to_number(v) for v in (s.get("data") or [])]
            series.append({"name": str(s.get("name") or "值"), "data": data})
        else:
            # 扁平数字/字符串列表：转成单系列
            data = [_to_number(v) for v in (series_raw if isinstance(s, (int, float)) else [s])]
            if data:
                series.append({"name": str(spec.get("name") or "值"), "data": data})
            break
    if not series:
        return None
    out = {
        "chartType": st,
        "title": str(spec.get("title") or ""),
        "categories": categories,
        "series": series,
        "area": bool(spec.get("area", st == "line")),
    }
    if spec.get("xName") is not None:
        out["xName"] = str(spec.get("xName"))
    if spec.get("yName") is not None:
        out["yName"] = str(spec.get("yName"))
    return out


def build_spec_from_tool_events(tool_events: list, question: str):
    """从工具调用事件里找到表格型查询结果，构建图表 spec；无则返回 None。

    优先用 sql_db_query 的返回结果（真实查询数据），失败则回退任意可解析的结果。
    """
    if not tool_events:
        return None
    preferred = [ev for ev in reversed(tool_events) if ev.get("type") == "tool" and ev.get("name") == "sql_db_query"]
    falls = [ev for ev in reversed(tool_events) if ev.get("type") == "tool"]
    for ev in preferred + falls:
        spec = build_spec_from_result(ev.get("result"), question)
        if spec:
            return spec
    return None


# ---- 确定性兜底：用户要图但模型没调 render_chart 时，从查询结果自动构建 spec ----

_CHART_KEYWORDS = [
    "图表", "柱状", "折线", "饼图", "饼状", "条形", "柱形", "趋势图",
    "可视化", "画图", "画个图", "画个图表", "柱图", "图",
    "chart", "bar", "line", "pie", "visualize",
]


def wants_chart(question: str) -> bool:
    q = (question or "").lower()
    return any(k in q for k in _CHART_KEYWORDS)


def _to_number(v):
    if v is None:
        return None
    s = str(v).strip().replace(",", "").replace("%", "")
    try:
        return float(s)
    except Exception:
        return None


def _is_numeric_col(values) -> bool:
    nums = [_to_number(v) for v in values]
    non_null = [n for n in nums if n is not None]
    return bool(non_null) and len(non_null) >= max(1, int(len(values) * 0.6))


def _literal_eval_safe(s):
    """把 Python 数据 repr 转成原生值；兼容 Decimal/numpy/datetime 等 SQL 结果常见类型。"""
    s = re.sub(r"\bDecimal\(\s*['\"]([^'\"]+)['\"]\s*\)", r"'\1'", s)
    s = re.sub(r"\bnumpy\.(?:int|float)\w*\(\s*['\"]([^'\"]+)['\"]\s*\)", r"'\1'", s)
    s = re.sub(r"\bdatetime\.datetime\(([^)]*)\)", r"'\1'", s)
    try:
        return ast.literal_eval(s)
    except Exception:
        return None


def _rows_from_sequences(value):
    """把 list 里的 dict / list / tuple 归一成 (headers, rows)；失败返回 None。"""
    if not value:
        return None
    if all(isinstance(r, dict) for r in value):
        headers = list(value[0].keys())
        rows = [[r.get(h) for h in headers] for r in value]
        return headers, rows
    seqs = []
    for r in value:
        if isinstance(r, (list, tuple)):
            seqs.append([c for c in r])
        else:
            seqs.append([r])
    if not seqs:
        return None
    ncols = max(len(r) for r in seqs)
    if ncols == 0:
        return None
    # SQL 结果多为「数据行」列表（无表头），全部当数据、列名 colN；
    # 有表头的情况由「多行制表分隔字符串」路径负责（见 _parse_result）。
    headers = [f"col{i + 1}" for i in range(ncols)]
    rows = seqs
    if not rows:
        return None
    return headers, rows


def _parse_result(result):
    """把查询结果解析成 (headers, rows)；失败返回 None。"""
    if result is None:
        return None
    if isinstance(result, str):
        stripped = result.strip()
        # 尝试 Python repr 列表（sql_db_query 默认返回 [('a', 1), ...]）
        if stripped.startswith("["):
            value = _literal_eval_safe(stripped)
            if isinstance(value, list):
                return _rows_from_sequences(value)
        lines = [ln.rstrip() for ln in result.splitlines() if ln.strip()]
        if not lines:
            return None
        if len(lines) == 1 and lines[0].strip().startswith("["):
            value = _literal_eval_safe(lines[0].strip())
            if isinstance(value, list):
                return _rows_from_sequences(value)
        sep = "\t" if "\t" in lines[0] else None
        headers = [h.strip().strip('"') for h in lines[0].split(sep)] if sep else lines[0].split()
        rows = []
        for ln in lines[1:]:
            cells = [c.strip().strip('"') for c in ln.split(sep)] if sep else ln.split()
            if cells:
                rows.append(cells)
        if not rows:
            return None
        return headers, rows
    if isinstance(result, list) and result:
        return _rows_from_sequences(result)
    return None


def build_spec_from_result(result, question: str):
    """从查询结果+问题自动构建图表 spec；不适合可视化时返回 None。

    规则：第一个非数值列作为横轴/扇区名，数值列作为 series；
    chartType 由问题关键词决定（趋势→line，占比→pie，否则→bar）。
    """
    parsed = _parse_result(result)
    if not parsed:
        return None
    headers, rows = parsed
    if len(headers) < 2 or not rows:
        return None

    n = len(rows)
    numeric_cols = [
        i for i in range(len(headers))
        if _is_numeric_col([r[i] if i < len(r) else None for r in rows])
    ]
    non_numeric = [i for i in range(len(headers)) if i not in numeric_cols]
    cat_col = non_numeric[0] if non_numeric else None
    if cat_col is None:
        # 全是数值列：用第一列当维度、其余当数值
        cat_col = 0
        numeric_cols = [i for i in numeric_cols if i != 0] or numeric_cols
    if not numeric_cols:
        return None

    categories = [str(r[cat_col]) if cat_col < len(r) else "" for r in rows]
    q = (question or "").lower()
    # 显式类型优先；否则用「时间/月份→line，占比→pie，其余→bar」的启发式
    if any(k in q for k in ["饼", "占比", "份额", "构成", "pie", "proportion"]):
        chart_type = "pie"
    elif any(k in q for k in ["柱状", "柱形", "条形", "柱图", "bar", "柱"]):
        chart_type = "bar"
    elif any(k in q for k in ["折线", "趋势", "走势", "line", "变化", "时间", "月份", "每月", "每天", "每年"]):
        chart_type = "line"
    else:
        chart_type = "bar"

    series = []
    for i in numeric_cols:
        name = str(headers[i]).strip() or f"系列{i + 1}"
        data = []
        for r in rows:
            v = _to_number(r[i]) if i < len(r) else None
            data.append(v if v is not None else 0)
        series.append({"name": name, "data": data})

    if chart_type == "pie":
        # 饼图只需一个系列；多系列时用第一个
        series = series[:1]
        categories = categories[: len(series[0]["data"])]

    return {
        "chartType": chart_type,
        "title": "",
        "categories": categories,
        "series": series,
        "area": chart_type == "line",
    }
