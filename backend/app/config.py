import os

# JWT
SECRET_KEY = os.getenv("ASK_DATA_SECRET", "dev-secret-change-me")
JWT_ALGORITHM = "HS256"
TOKEN_EXPIRE_MINUTES = 60 * 24  # 1 day

# 记忆存储 PostgreSQL（本地 Docker，askdata_memory 库）
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://askdata:askdata@localhost:5432/askdata_memory",
)

# mock 阶段的内置演示账号
#   email: demo@askdata.dev
#   password: demo123456
DEMO_USERS = {
    "demo@askdata.dev": {
        "password": "demo123456",
        "name": "DeepData Demo",
        "plan": "free",
    }
}
