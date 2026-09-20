# DeepData · 问数工具

> 用一句话，问清你的数据。

DeepData 是一个**自然语言数据问答智能体**：你用中文描述想了解的问题，它连接数据源（PostgreSQL），通过 **LangGraph + LLM + SQL 工具**给出**可追溯、可解释**的回答，并把「思考过程」「工具调用信息」透明地展示在界面上。

---

## 功能特性 / Features

- **自然语言提问** —— 一句话描述问题，无需手写 SQL
- **LLM 智能体** —— DeepSeek（OpenAI 兼容接口）驱动，多轮对话
- **SQL 工具调用** —— 绑定 `SQLDatabaseToolkit`，模型可自主查询数据库（列表 / 结构 / 执行 SQL）
- **思考过程透明** —— 流式展示模型 `reasoning`，可折叠
- **工具调用可视化** —— 每次工具调用的参数与结果以卡片展示（复用思考样式）
- **会话持久化** —— 按 `session_id` 保存历史（含思考与工具信息），刷新可恢复
- **会话管理** —— 侧栏会话列表、新建、删除；支持多会话切换
- **对话宽度可调** —— 鼠标悬停对话条左右边缘拖拽调宽（50–72rem，默认 60）
- **蓝色主题 + markdown 渲染** —— 深海军蓝 + 主蓝 + 白色留白，回答支持 markdown

## 技术栈 / Tech Stack

| 层 | 技术 |
|----|------|
| 前端 | React 19 · Vite · Tailwind CSS v4 · Ant Design · assistant-ui (Thread) · Base UI · axios · react-router |
| 后端 | FastAPI (Python) · uvicorn · PyJWT · LangChain · LangGraph · SQLAlchemy · langchain-deepseek |
| 数据 | PostgreSQL（智能体记忆 `askdata_memory`）＋ 业务数据源（`PG_CONNECTION_STRING`） |

## 工作原理 / How it works

```text
用户一句话
   │
   ▼
FastAPI /api/ask/stream (SSE)
   │  多轮历史（checkpointer，按 session_id）
   ▼
LangGraph 智能体
   │  ChatDeepSeek(LLM) + SQLDatabaseToolkit(工具)
   │  ├─ 模型思考 → 「reasoning」 事件
   │  ├─ 模型回答 → 「text」 事件
   │  └─ 调用 SQL 工具 → 「tool」 事件（name/args/result）
   ▼
前端（assistant-ui Thread）
   思考折叠卡 + 工具调用卡 + markdown 回答
```

## 项目结构 / Structure

```text
AskData_Agent/
├─ frontend/                 # React + Vite 前端
│  └─ src/
│     ├─ pages/
│     │  ├─ Login.jsx        # 登录页（JWT）
│     │  └─ Chat.jsx         # 智能体对话页（SSE 流 + 会话列表）
│     ├─ components/
│     │  ├─ thread.aui.tsx   # assistant-ui Thread 封装（含自定义工具卡渲染）
│     │  ├─ promptbar/       # 输入栏（发送/停止/模型选择）
│     │  └─ assistant-ui/    # reasoning / tool-call / tool-group 等元素
│     └─ api/index.js        # Axios + SSE 解析封装
│
└─ backend/                  # FastAPI 后端
   └─ app/
      ├─ main.py             # 入口 + CORS + /api/health
      ├─ config.py           # JWT / DATABASE_URL / 演示账号
      ├─ schemas.py          # 请求/响应模型
      ├─ routers/
      │  ├─ auth.py          # POST /api/login（JWT）
      │  └─ ask.py           # /api/ask, /api/ask/stream, history, sessions
      ├─ datasource/
      │  └─ pg.py            # PG 连接串（仅从环境变量读取）+ get_pg_database
      ├─ tools/SQLTools/     # SQLDatabaseToolkit 封装（4 个 SQL 工具）
      └─ services/
         ├─ pipeline/        # LangGraph：graph / llm / runner / nodes
         └─ memory/store.py  # 记忆存储（checkpointer）
```

## 本地开发 / Setup

### 环境要求
- 前端：Node.js（Vite）
- 后端：Python 3.11+（项目自带 `backend\.venv`）
- 记忆库：本地 Docker 起的 PostgreSQL（库名 `askdata_memory`）

### 1. 配置环境变量

复制 `backend/.env.example` 为 `backend/.env` 并填写（`.env` 已被 gitignore，不会提交）：

```bash
# LLM（OpenAI 兼容接口）
LLM_MODEL=your-model-id
LLM_MODEL_ID=your-model-id
LLM_BASE_URL=https://your-llm-endpoint/v1
LLM_API_KEY=sk-xxxxxx

# 业务数据源（智能体 SQL 工具所连的库；只放占位符，真实值写在本机 .env）
PG_CONNECTION_STRING=postgresql+psycopg://USER:PASSWORD@HOST:PORT/DB

# 记忆存储（本地 Docker）
DATABASE_URL=postgresql://askdata:askdata@localhost:5432/askdata_memory
```

> ⚠️ **安全**：`PG_CONNECTION_STRING` 含数据库凭据，**只写入本地 `.env`**（已 gitignore），代码中不落任何默认值。未配置时 SQL 工具自动禁用，智能体退化为纯对话。

### 2. 启动记忆库

```bash
cd backend
docker compose up -d
```

### 3. 启动后端（端口 8100）

```bash
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8100 --reload
```

> 端口 8000 若被占用，后端已改用 **8100**。

### 4. 启动前端（端口 5173）

```bash
cd frontend
pnpm install      # 或 npm install
pnpm dev          # 或 npm run dev  → http://127.0.0.1:5173
```

前端通过 Vite 把 `/api` 代理到 `127.0.0.1:8100`（见 `frontend/vite.config.js`）。

### 演示账号

```
邮箱：demo@askdata.dev
密码：demo123456
```

## 环境变量 / Environment Variables

| 变量 | 说明 | 是否必填 |
|------|------|----------|
| `LLM_BASE_URL` | LLM（OpenAI 兼容）接口地址 | 是 |
| `LLM_API_KEY` | LLM 密钥 | 是 |
| `LLM_MODEL` / `LLM_MODEL_ID` | 模型 id | 是 |
| `PG_CONNECTION_STRING` | 业务数据源 PG 连接串（`postgresql+psycopg://...`） | 可选（不配则无 SQL 工具） |
| `DATABASE_URL` | 记忆库连接串（`askdata_memory`） | 是 |
| `ASK_DATA_SECRET` | JWT 签名密钥（生产务必改） | 建议 |

## 接口 / API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| POST | `/api/login` | 登录，返回 JWT + 用户信息 |
| POST | `/api/ask` | 同步问答，返回 `{ question, answer, reasoning, sql, chart, session_id }` |
| POST | `/api/ask/stream` | **流式问答（SSE）**，逐块推送推理/回答/工具/完成事件 |
| GET | `/api/ask/history?session_id=` | 读取某会话历史（含 `reasoning`、`tools`） |
| GET | `/api/ask/sessions` | 枚举历史会话列表（按最近更新倒序） |
| DELETE | `/api/ask/sessions/{session_id}` | 删除某会话及其全部历史 |

### SSE 事件格式（`/api/ask/stream`）

```jsonc
{"type":"reasoning","delta":"模型的思考增量"}
{"type":"text","delta":"回答增量"}
{"type":"tool","name":"sql_db_query","args":{...},"result":"..."}   // 工具调用
{"type":"error","error":"错误信息"}
{"type":"done","answer":"...","reasoning":["..."],"tools":[{"name","args","result"}],"session_id":"..."}
```

## 下一步 / Roadmap

- [x] 登录（JWT）
- [x] 智能体对话页（SSE 流 + 思考过程 + markdown）
- [x] LangGraph 多轮 + 短期记忆（checkpointer）
- [x] 数据源接入 + SQL 工具（SQLDatabaseToolkit）
- [x] 工具调用信息可视化（卡片）
- [x] 会话历史 / 列表 / 删除
- [x] 对话宽度拖拽调节
- [ ] 数据源管理界面（多数据源切换）
- [ ] 图表一键生成（回答 → 可视化）
- [ ] Docker / CI 部署

---

© DeepData · realChengboYU
