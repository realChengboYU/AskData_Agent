import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../api'
import './login.css'

const FEATURES = ['连接你的数据源', '答案全程可追溯', '结果一键转图表']

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('请输入邮箱和密码')
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await login({ email: email.trim(), password })
      if (data?.token) {
        localStorage.setItem('askdata_token', data.token)
        localStorage.setItem('askdata_user', JSON.stringify(data.user ?? {}))
      }
      navigate('/chat')
    } catch (err) {
      setError(err?.response?.data?.detail ?? '登录失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login">
      <aside className="brand">
        <span className="orb orb-1"></span>
        <span className="orb orb-2"></span>
        <span className="orb orb-3"></span>
        <span className="orb orb-4"></span>

        <div className="brand-inner">
          <div className="brand-head">
            <span className="brand-mark">◆</span>
            <span className="brand-name">AskData Agent</span>
          </div>

          <h1 className="brand-pitch">用一句话，问清你的数据</h1>
          <p className="brand-sub">
            自然语言提问，自动生成查询与图表。像聊天一样分析数据。
          </p>

          <ul className="features">
            {FEATURES.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>

          <svg
            className="brand-chart"
            viewBox="0 0 320 96"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0,78 C40,70 64,52 96,50 C128,48 152,60 184,42 C216,24 248,30 280,18 L320,12 L320,96 L0,96 Z"
              fill="url(#area)"
            />
            <path
              className="chart-line"
              pathLength="1"
              d="M0,78 C40,70 64,52 96,50 C128,48 152,60 184,42 C216,24 248,30 280,18 L320,12"
              fill="none"
              stroke="#ffffff"
              strokeOpacity="0.9"
              strokeWidth="2"
            />
            <circle cx="184" cy="42" r="3.5" fill="#ffffff" />
            <circle cx="280" cy="18" r="3.5" fill="#ffffff" />
          </svg>
        </div>
      </aside>

      <main className="panel">
        <div className="form-card">
          <h2 className="form-title">欢迎回来</h2>
          <p className="form-sub">登录后继续你的数据提问</p>

          <form onSubmit={submit}>
            <label className="field-label" htmlFor="email">邮箱</label>
            <input
              id="email"
              className="field"
              type="email"
              placeholder="you@example.com"
              value={email}
              autoComplete="username"
              onChange={(e) => setEmail(e.target.value)}
            />

            <label className="field-label" htmlFor="password">密码</label>
            <input
              id="password"
              className="field"
              type="password"
              placeholder="••••••••"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
            />

            <div className="form-row">
              <label className="check">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span>记住我</span>
              </label>
              <a className="forgot" href="#" onClick={(e) => e.preventDefault()}>忘记密码？</a>
            </div>

            {error && <div className="form-error">{error}</div>}

            <div className="cta">
              <span className="cta-glow" aria-hidden="true"></span>
              <button className="submit" type="submit" disabled={loading}>
                {loading ? '登录中…' : '登录'}
              </button>
            </div>
          </form>

          <div className="divider"><span>或</span></div>

          <div className="sso-row">
            <button className="sso" type="button">继续使用 Google</button>
            <button className="sso" type="button">继续使用 GitHub</button>
          </div>

          <p className="trust">
            <span className="lock">🔒</span> 由 AskData 安全连接你的数据源
          </p>
          <p className="register">
            还没有账号？<a href="#" onClick={(e) => e.preventDefault()}>免费注册</a>
          </p>
        </div>
      </main>
    </div>
  )
}
