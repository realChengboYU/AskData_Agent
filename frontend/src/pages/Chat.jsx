import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { askQuestion } from '../api'
import './chat.css'

function ChartBars({ chart }) {
  const nums = (chart?.values || []).map(Number)
  const max = nums.length ? Math.max(...nums) : 0
  return (
    <div className="chart-block">
      <div className="chart-title">{chart.title}</div>
      <div className="bars">
        {chart.labels.map((label, i) => {
          const val = Number(chart.values[i])
          const pct = max ? Math.round((val / max) * 100) : 0
          return (
            <div className="bar" key={label}>
              <div className="bar-value">{val.toLocaleString('zh-CN')} {chart.unit}</div>
              <div className="bar-track">
                <div className="bar-fill" style={{ height: `${pct}%` }}></div>
              </div>
              <div className="bar-label">{label}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Chat() {
  const navigate = useNavigate()
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const listRef = useRef(null)

  const user = JSON.parse(localStorage.getItem('askdata_user') || '{}')

  function logout() {
    localStorage.removeItem('askdata_token')
    localStorage.removeItem('askdata_user')
    navigate('/login')
  }

  const scrollBottom = () =>
    requestAnimationFrame(() =>
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }),
    )

  async function send() {
    const q = input.trim()
    if (!q || loading) return
    setInput('')
    setMessages((prev) => [...prev, { id: Date.now(), role: 'user', content: q }])
    setLoading(true)
    try {
      const data = await askQuestion({ question: q })
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          role: 'assistant',
          content: data?.answer ?? '（后端未返回答案内容）',
          reasoning: data?.reasoning ?? [],
          sql: data?.sql ?? null,
          chart: data?.chart ?? null,
        },
      ])
    } catch (err) {
      const msg =
        err?.response?.data?.detail ?? '暂时无法连接后端服务，请确认 FastAPI 已在 8000 端口启动。'
      setMessages((prev) => [
        ...prev,
        { id: Date.now(), role: 'assistant', content: msg, error: true },
      ])
    } finally {
      setLoading(false)
      requestAnimationFrame(scrollBottom)
    }
  }

  return (
    <div className="chat">
      <header className="chat-head">
        <div className="chat-brand">
          <span className="chat-mark">◆</span>
          <span className="chat-name">AskData Agent</span>
        </div>
        <div className="chat-head-right">
          <span className="chat-user">{user?.name || 'AskData'}</span>
          <button className="chat-logout" onClick={logout}>退出</button>
        </div>
      </header>

      <main className="chat-main" ref={listRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>你好，{user?.name || '我是 AskData'} 👋</p>
            <p>用一句话提问，我会从你的数据里找出可追溯、可解释的答案。</p>
            <div className="chips">
              <button className="chip" onClick={() => setInput('上个月销售额前五的产品分别卖了多少？')}>
                上个月销售额 Top 5
              </button>
              <button className="chip" onClick={() => setInput('上周新增用户的第七天留存率是多少？')}>
                上周 D7 留存率
              </button>
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.role}`}>
            <div className="msg-avatar">{m.role === 'assistant' ? '◆' : '你'}</div>
            <div className="msg-body">
              <div className={`bubble ${m.role}${m.error ? ' error' : ''}`}>{m.content}</div>

              {m.role === 'assistant' && m.chart?.type === 'bar' && <ChartBars chart={m.chart} />}

              {m.role === 'assistant' && m.reasoning?.length > 0 && (
                <details className="trace">
                  <summary>推理过程（可追溯）</summary>
                  <ol>
                    {m.reasoning.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </details>
              )}

              {m.role === 'assistant' && m.sql && (
                <details className="trace">
                  <summary>生成查询 SQL</summary>
                  <pre>{m.sql}</pre>
                </details>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="msg assistant">
            <div className="msg-avatar">◆</div>
            <div className="msg-body">
              <div className="bubble assistant thinking">
                <span className="dot"></span>
                <span className="dot"></span>
                <span className="dot"></span>
                <em>正在分析你的数据…</em>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="chat-composer">
        <div className="composer-wrap">
          <textarea
            className="composer"
            value={input}
            placeholder="例如：上个月销售额前五的产品分别卖了多少？"
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          <button className="send" onClick={send} disabled={loading || !input.trim()}>
            发送
          </button>
        </div>
        <p className="composer-hint">Enter 发送 · Shift + Enter 换行</p>
      </footer>
    </div>
  )
}
