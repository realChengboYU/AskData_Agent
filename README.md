# AskData_Agent · 问数工具

用一句话，问清你的数据。

AskData 是一个**自然语言数据问答工具**：用中文描述你想知道的问题，它连接数据源、给出**可追溯、可解释**的答案，并把结果**一键转成图表**。

## 功能特性 / Features

- **自然语言提问** —— 用一句话描述问题，无需写 SQL
- **答案可追溯、可解释** —— 每一步推理都透明
- **结果一键转图表** —— 回答直接可视化
- **蓝色主题界面** —— 深海军蓝 + 主蓝 + 白色留白，现代 SaaS 风

## 技术栈 / Tech Stack

| 层 | 技术 |
|----|------|
| 前端 | Vue 3 · Vite · Pinia · vue-router · Element Plus · Axios |
| 后端 | FastAPI (Python) · uvicorn · PyJWT |
| 数据 | 演示数据集（销售 / 留存），后续接真实源 |

## 项目结构 / Structure

```text
AskData_Agent/
├─ frontend/          # Vue 3 + Vite 前端
│  └─ src/
│     ├─ views/
│     │  ├─ LoginView.vue   # 登录页（蓝色主题 + 光晕按钮）
│     │  └─ AskView.vue     # 提问页（回答 + 推理 + SQL + 图表）
│     ├─ api/index.js       # Axios 封装（/api/login, /api/ask）
│     └─ router/index.js
└─ backend/           # FastAPI 后端
   └─ app/
      ├─ main.py            # 应用入口 + CORS + /api/health
      ├─ routers/
      │  ├─ auth.py         # POST /api/login（JWT）
      │  └─ ask.py          # POST /api/ask
      ├─ services/
      │  └─ ask_engine.py   # 演示问答引擎（可追溯/可解释）
      └─ schemas.py
```

## 本地开发 / Develop

```bash
# 后端（终端 1）
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# 前端（终端 2）
cd frontend
pnpm install
pnpm dev            # http://127.0.0.1:5173
```

演示账号：`demo@askdata.dev` / `demo123456`

## 接口 / API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/login` | 登录，返回 JWT + 用户信息 |
| POST | `/api/ask` | 提问，返回 `{ answer, reasoning, sql, chart }` |

## 下一步 / Roadmap

- [x] 前端登录页（蓝色主题 + 动态极光 + 艺术字 + 光晕按钮）
- [x] FastAPI 后端 `/api/login` + `/api/ask`（可追溯、可解释的演示引擎）
- [ ] 接真实数据源 / LLM 问答
- [ ] 路由守卫 + 会话保持
- [ ] Docker / CI 部署

---

© AskData_Agent · realChengboYU
