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
| 后端 | FastAPI (Python) — 拟建 |
| 数据 | 待接数据源（SQL / CSV / API） |

## 项目结构 / Structure

```text
AskData_Agent/
├─ frontend/          # Vue 3 + Vite 前端
│  └─ src/
│     ├─ views/
│     │  ├─ LoginView.vue   # 登录页
│     │  └─ AskView.vue     # 提问页
│     ├─ api/index.js       # Axios 封装（/api/ask）
│     └─ router/index.js
└─ backend/           # FastAPI 后端（待建）
```

## 本地开发 / Develop

```bash
# 前端
cd frontend
pnpm install
pnpm dev            # http://127.0.0.1:5173
```

## 下一步 / Roadmap

- [x] 前端登录页（蓝色主题 + 动态极光 + 艺术字 + 光晕按钮）
- [ ] FastAPI 后端 `/api/ask` 问答接口
- [ ] 数据源接入
- [ ] 登录鉴权

---

© AskData_Agent · realChengboYU
