<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { User, Lock, Unlock } from '@element-plus/icons-vue'
import { login } from '../api'

const router = useRouter()

const formRef = ref(null)
const loading = ref(false)

const form = ref({
  email: '',
  password: '',
  remember: true,
})

const rules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' },
  ],
}

async function submit() {
  await formRef.value.validate().catch(() => Promise.reject())
  loading.value = true
  try {
    const data = await login({
      email: form.value.email,
      password: form.value.password,
    })
    if (data?.token) {
      localStorage.setItem('askdata_token', data.token)
      localStorage.setItem('askdata_user', JSON.stringify(data.user ?? {}))
    }
    ElMessage.success(`欢迎回来，${data?.user?.name ?? 'AskData'}！`)
    router.push('/ask')
  } catch (err) {
    ElMessage.error(err?.response?.data?.detail ?? '登录失败，请稍后重试')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login">
    <!-- 左侧：动态背景品牌面板 -->
    <aside class="brand">
      <span class="orb orb-1"></span>
      <span class="orb orb-2"></span>
      <span class="orb orb-3"></span>
      <span class="orb orb-4"></span>

      <div class="brand-inner">
        <div class="brand-head">
          <span class="brand-mark">◆</span>
          <span class="brand-name">AskData Agent</span>
        </div>

        <h1 class="brand-pitch">用一句话，问清你的数据</h1>
        <p class="brand-sub">自然语言提问，自动生成查询与图表。像聊天一样分析数据。</p>

        <ul class="features">
          <li>连接你的数据源</li>
          <li>答案全程可追溯</li>
          <li>结果一键转图表</li>
        </ul>

        <svg
          class="brand-chart"
          viewBox="0 0 320 96"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#ffffff" stop-opacity="0.3" />
              <stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0,78 C40,70 64,52 96,50 C128,48 152,60 184,42 C216,24 248,30 280,18 L320,12 L320,96 L0,96 Z"
            fill="url(#area)"
          />
          <path
            class="chart-line"
            pathLength="1"
            d="M0,78 C40,70 64,52 96,50 C128,48 152,60 184,42 C216,24 248,30 280,18 L320,12"
            fill="none"
            stroke="#ffffff"
            stroke-opacity="0.9"
            stroke-width="2"
          />
          <circle cx="184" cy="42" r="3.5" fill="#ffffff" />
          <circle cx="280" cy="18" r="3.5" fill="#ffffff" />
        </svg>
      </div>
    </aside>

    <!-- 右侧：登录表单 -->
    <main class="panel">
      <div class="form-card">
        <h2 class="form-title">欢迎回来</h2>
        <p class="form-sub">登录后继续你的数据提问</p>

        <el-form
          ref="formRef"
          :model="form"
          :rules="rules"
          label-position="top"
          size="large"
          @keydown.enter.prevent="submit"
        >
          <el-form-item prop="email" label="邮箱">
            <el-input
              v-model="form.email"
              :prefix-icon="User"
              placeholder="you@example.com"
              autocomplete="username"
            />
          </el-form-item>

          <el-form-item prop="password" label="密码">
            <el-input
              v-model="form.password"
              :prefix-icon="Lock"
              type="password"
              show-password
              placeholder="请输入密码"
              autocomplete="current-password"
            />
          </el-form-item>

          <div class="form-row">
            <el-checkbox v-model="form.remember">记住我</el-checkbox>
            <el-link type="primary" :underline="false">忘记密码？</el-link>
          </div>

          <div class="cta">
            <span class="cta-glow" aria-hidden="true"></span>
            <el-button
              class="submit"
              type="primary"
              native-type="submit"
              :loading="loading"
              @click="submit"
            >
              {{ loading ? '登录中…' : '登录' }}
            </el-button>
          </div>
        </el-form>

        <el-divider class="divider">或</el-divider>

        <div class="sso-row">
          <el-button class="sso" plain>
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span>Google</span>
          </el-button>
          <el-button class="sso" plain>
            <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
              <path
                fill="currentColor"
                d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
              />
            </svg>
            <span>GitHub</span>
          </el-button>
        </div>

        <div class="trust">
          <el-icon><Unlock /></el-icon>
          <span>由 AskData 安全连接你的数据源</span>
        </div>

        <div class="switch">
          <span>还没有账号？</span>
          <el-link type="primary" :underline="false">注册</el-link>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.login {
  min-height: 100vh;
  display: flex;
  background: #eff6ff;
}

/* ---------- 左侧：动态背景品牌面板 ---------- */
.brand {
  position: relative;
  overflow: hidden;
  width: 46%;
  min-width: 380px;
  color: #eaf2ff;
  background: linear-gradient(160deg, #1e3a8a 0%, #2563eb 55%, #3b82f6 100%);
  display: flex;
  align-items: center;
}

/* 动态光球（2025+ 渐变 / orb 动效） */
.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(70px);
  opacity: 0.55;
  pointer-events: none;
}

.orb-1 {
  width: 460px;
  height: 460px;
  background: #3b82f6;
  top: -120px;
  left: -90px;
  animation: drift1 36s ease-in-out infinite;
}

.orb-2 {
  width: 380px;
  height: 380px;
  background: #60a5fa;
  bottom: -90px;
  right: -60px;
  animation: drift2 44s ease-in-out infinite;
}

.orb-3 {
  width: 240px;
  height: 240px;
  background: #93c5fd;
  top: 38%;
  right: 20%;
  opacity: 0.4;
  animation: drift3 52s ease-in-out infinite;
}

.orb-4 {
  width: 200px;
  height: 200px;
  background: #2563eb;
  bottom: 12%;
  left: 16%;
  opacity: 0.32;
  animation: drift4 60s ease-in-out infinite;
}

.brand-inner {
  position: relative;
  z-index: 1;
  width: min(420px, 82%);
  margin: 0 auto;
  padding: 32px 0;
}

.brand-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 46px;
}

.brand-mark {
  font-size: 20px;
  color: #93c5fd;
}

.brand-name {
  font-size: 19px;
  font-weight: 650;
  letter-spacing: 0.01em;
}

/* 艺术字大标题：站酷庆科黄油体 */
.brand-pitch {
  margin: 0 0 14px;
  font-family: "ZCOOL QingKe HuangYou", system-ui, sans-serif;
  font-size: 38px;
  line-height: 1.28;
  font-weight: 400;
  letter-spacing: 0.02em;
  color: #ffffff;
  text-shadow: 0 2px 26px rgba(31, 82, 218, 0.45);
}

.brand-sub {
  margin: 0 0 30px;
  font-size: 15px;
  line-height: 1.7;
  color: #bfdbfe;
}

.features {
  list-style: none;
  margin: 0 0 42px;
  padding: 0;
  display: grid;
  gap: 16px;
}

.features li {
  display: grid;
  grid-template-columns: 4px 1fr;
  column-gap: 12px;
  align-items: center;
  font-size: 15px;
  color: #dbeafe;
}

/* 用纤细的竖向渐变条替代圆点，更精致；Grid 固定两列，保证三行严格左对齐 */
.features li::before {
  content: "";
  width: 4px;
  height: 16px;
  border-radius: 2px;
  background: linear-gradient(180deg, #60a5fa, #2563eb);
}

.brand-chart {
  display: block;
  width: 100%;
  height: 96px;
}

/* ---------- 右侧：表单卡片 ---------- */
.panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 24px;
}

.form-card {
  width: min(412px, 100%);
  background: #ffffff;
  border: 1px solid #dbeafe;
  border-radius: 18px;
  padding: 38px 36px;
  box-shadow: 0 12px 34px rgba(30, 58, 138, 0.10);
}

.form-title {
  margin: 0 0 6px;
  font-size: 26px;
  font-weight: 650;
  color: #1e3a8a;
}

.form-sub {
  margin: 0 0 26px;
  font-size: 14px;
  color: #64748b;
}

.form-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 2px 0 22px;
}

.cta {
  position: relative;
  width: 100%;
}

/* 动态多彩光晕：放在深色按钮背后，模糊成霓虹 halo */
.cta-glow {
  position: absolute;
  inset: -4px -10px;
  border-radius: 20px;
  background: conic-gradient(
    from 0deg,
    #2563eb,
    #3b82f6,
    #60a5fa,
    #93c5fd,
    #3b82f6,
    #2563eb
  );
  filter: blur(22px);
  opacity: 0;
  transform: scale(1.04);
  transition: opacity 0.5s ease;
  z-index: 0;
}

/* 鼠标悬停或键盘聚焦时才显示光晕 */
.cta:hover .cta-glow,
.cta:focus-within .cta-glow {
  opacity: 1;
}

.submit {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 46px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.02em;
  background: #1e3a8a !important;
  border: none !important;
  color: #ffffff !important;
  border-radius: 14px;
}

.submit:hover,
.submit:focus {
  background: #2563eb !important;
  color: #ffffff !important;
}

.divider {
  margin: 24px 0 16px;
}

.sso-row {
  display: flex;
  gap: 12px;
}

.sso {
  flex: 1;
  height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 15px;
  color: #1e3a8a;
  border-color: #dbeafe;
}

.sso:hover {
  border-color: #2563eb;
  color: #2563eb;
}

.trust {
  margin-top: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 13px;
  color: #94a3b8;
}

.switch {
  margin-top: 16px;
  text-align: center;
  font-size: 14px;
  color: #64748b;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

/* ---------- 动效 ---------- */
@media (prefers-reduced-motion: no-preference) {
  /* 登录按钮背后的多彩光晕旋转 */
  .cta-glow {
    animation: aurora 12s linear infinite;
  }

  @keyframes aurora {
    to {
      transform: rotate(360deg) scale(1.04);
    }
  }

  /* 文字动态出现：macOS 欢迎屏风格（淡入 + 上移 + 缩放 + 柔化），放慢节奏 */
  .brand-head,
  .brand-pitch,
  .brand-sub,
  .features {
    opacity: 0;
    animation: rise 1.9s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }
  .brand-head {
    animation-delay: 0.15s;
  }
  .brand-pitch {
    animation-delay: 0.55s;
  }
  .brand-sub {
    animation-delay: 1s;
  }
  .features {
    animation-delay: 1.45s;
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(18px) scale(0.965);
      filter: blur(6px);
    }
    to {
      opacity: 1;
      transform: none;
      filter: none;
    }
  }

  .chart-line {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: draw 2.2s ease forwards;
  }

  @keyframes draw {
    to {
      stroke-dashoffset: 0;
    }
  }

  @keyframes drift1 {
    0%,
    100% {
      transform: translate(0, 0) scale(1);
    }
    50% {
      transform: translate(70px, 50px) scale(1.15);
    }
  }

  @keyframes drift2 {
    0%,
    100% {
      transform: translate(0, 0) scale(1);
    }
    50% {
      transform: translate(-60px, -40px) scale(1.12);
    }
  }

  @keyframes drift3 {
    0%,
    100% {
      transform: translate(0, 0) scale(1);
    }
    50% {
      transform: translate(-36px, 36px) scale(1.2);
    }
  }

  @keyframes drift4 {
    0%,
    100% {
      transform: translate(0, 0) scale(1) rotate(0deg);
    }
    50% {
      transform: translate(40px, -30px) scale(1.18) rotate(20deg);
    }
  }
}

/* ---------- 响应式 ---------- */
@media (max-width: 880px) {
  .brand {
    display: none;
  }
  .panel {
    padding: 32px 20px;
  }
  .form-card {
    padding: 30px 26px;
  }
}
</style>
