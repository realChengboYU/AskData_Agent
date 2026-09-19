from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import ask, auth

app = FastAPI(
    title="DeepData API",
    version="0.1.0",
    description="问数工具后端：自然语言提问 -> 可追溯、可解释的答案 + 图表。",
)

# 允许本地前端（Vite dev server）跨域访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(ask.router)


@app.get("/api/health", tags=["system"])
def health() -> dict:
    return {"status": "ok", "service": "deepdata", "version": "0.1.0"}
