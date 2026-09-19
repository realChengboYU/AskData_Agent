"""
演示用问答引擎（mock 阶段）。

对外只暴露 `answer_question(question) -> dict`，返回结构固定：
    {
        "question": str,
        "answer": str,
        "reasoning": list[str],   # 每一步推理，体现"可解释/可追溯"
        "sql": str | None,        # 生成的可追溯查询
        "chart": dict | None,     # 供前端一键转图表的柱状图规格
    }

后续接入真实数据源 / LLM 时，只需替换本模块，路由与 schema 不变。
"""

from typing import Optional

# 内置演示数据集：上个月销售额（真实可回溯，便于展示"可追溯"）
_TOP5_PRODUCTS = [
    {"name": "智能手表", "amount": 128300, "share": 0.24},
    {"name": "蓝牙耳机", "amount": 96450, "share": 0.18},
    {"name": "便携键盘", "amount": 78900, "share": 0.15},
    {"name": "机械鼠标", "amount": 64120, "share": 0.12},
    {"name": "桌面音箱", "amount": 52800, "share": 0.10},
]


def _top5_bar_chart() -> dict:
    return {
        "type": "bar",
        "title": "上月销售额 Top 5 商品",
        "labels": [p["name"] for p in _TOP5_PRODUCTS],
        "values": [p["amount"] for p in _TOP5_PRODUCTS],
        "unit": "元",
    }


def _handle_sales(question: str) -> dict:
    steps = [
        "识别到问题涉及「销售 / 业绩」维度。",
        "定位事实表 `orders` 与维表 `products`，并按 `product_id` 关联。",
        "按时间过滤：取 `created_at` 在过去一个月内的订单。",
        f"用 `GROUP BY` 聚合各商品销售额，按金额降序取前 5 名。",
    ]
    sql = (
        "SELECT p.name AS product,\n"
        "       SUM(o.amount) AS total_amount\n"
        "FROM orders o\n"
        "JOIN products p ON o.product_id = p.id\n"
        "WHERE o.created_at >= date('now', '-1 month')\n"
        "GROUP BY p.name\n"
        "ORDER BY total_amount DESC\n"
        "LIMIT 5;"
    )
    answer = (
        "我整理了上月销售额 Top 5 商品，从高到低依次是：" +
        "；".join(f"{p['name']} {p['amount']:,} 元（约占 {p['share']*100:.0f}%）" for p in _TOP5_PRODUCTS) +
        "。其中「智能手表」领跑，贡献了整月约 24% 的销售额。"
    )
    return {
        "question": question,
        "answer": answer,
        "reasoning": steps,
        "sql": sql,
        "chart": _top5_bar_chart(),
    }


def _handle_retention(question: str) -> dict:
    steps = [
        "识别到问题涉及「留存 / 活跃」维度。",
        "定位事件表 `events`，按 `user_id` 与 `day` 计算首次活跃日。",
        "对每个用户取首日后第 7 天是否仍活跃，得到留存率。",
        "汇总整体 D7 留存率，并与上周做对比。",
    ]
    sql = (
        "WITH first_seen AS (\n"
        "  SELECT user_id, MIN(day) AS first_day\n"
        "  FROM events GROUP BY user_id\n"
        "),\n"
        "d7 AS (\n"
        "  SELECT f.user_id\n"
        "  FROM first_seen f JOIN events e ON e.user_id = f.user_id\n"
        "  WHERE e.day = date(f.first_day, '+7 days')\n"
        ")\n"
        "SELECT COUNT(*) AS d7_retained,\n"
        "       (SELECT COUNT(*) FROM first_seen) AS cohort\n"
        "FROM d7;"
    )
    answer = (
        "按最近一个新增用户群计算，第 7 天留存率为 42.6%，较前一周的 39.1% 提升约 3.5 个百分点。"
        "其中通过「收藏」功能的用户留存率更高（58.3%），可作为后续优化重点。"
    )
    return {
        "question": question,
        "answer": answer,
        "reasoning": steps,
        "sql": sql,
        "chart": None,
    }


def answer_question(question: str) -> dict:
    q = (question or "").strip()
    if not q:
        return {
            "question": q,
            "answer": "请先输入一个问题，例如：上个月销售额前五的产品分别卖了多少？",
            "reasoning": ["未检测到有效问题。"],
            "sql": None,
            "chart": None,
        }

    if any(k in q for k in ("销售", "销量", "营收", "收入", "订单", "卖", "销售额", "商品")):
        return _handle_sales(q)
    if any(k in q for k in ("留存", "活跃", "日活", "dau", "用户数", "da u")):
        return _handle_retention(q)

    # fallback：演示模式未覆盖
    return {
        "question": q,
        "answer": (
            "我理解了你的问题，但当前演示数据集还没有覆盖这个维度。"
            "你可以试着问：上个月销售额前五的产品分别卖了多少？"
        ),
        "reasoning": ["当前为演示模式，仅内置「销售」与「留存」两类数据集。"],
        "sql": None,
        "chart": None,
    }
