import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AssistantRuntimeProvider, useExternalStoreRuntime } from '@assistant-ui/react'
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function makeId() {
  return (crypto?.randomUUID?.() ?? `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`)
}

function extractText(content) {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((p) => (p && typeof p === 'object' && typeof p.text === 'string' ? p.text : ''))
      .join('')
  }
  return ''
}

export default function Chat() {
  const navigate = useNavigate()
  const [messages, setMessagesState] = useState([])
  const [extra, setExtra] = useState({})
  const [input, setInput] = useState('')
  const messagesRef = useRef([])
  const runtimeRef = useRef(null)

  // assistant-ui 外部 store 的 setter：只接受整段数组，此处同步到 ref + state
  const setMessages = (msgs) => {
    messagesRef.current = msgs
    setMessagesState(msgs)
  }

  const isRunning = messagesRef.current.some((m) => m.role === 'assistant' && m.status?.type === 'running')

  const runtime = useExternalStoreRuntime({
    messages,
    setMessages,
    isRunning,
    convertMessage: (m) => m,
    onNew: async (message) => {
      const question = extractText(message.content).trim()
      if (!question) return
      const assistantId = makeId()
      // 用户消息：若运行时未把用户消息推回 state，则补上；已存在则去重
      const last = messagesRef.current[messagesRef.current.length - 1]
      const lastIsSameUser =
        last?.role === 'user' && extractText(last?.content ?? '').trim() === question
      const base = lastIsSameUser
        ? messagesRef.current
        : [...messagesRef.current, { id: last?.id ?? makeId(), role: 'user', content: question }]
      setMessages([...base, { id: assistantId, role: 'assistant', content: '', status: { type: 'running' } }])
      try {
        const data = await askQuestion({ question })
        const answer = data?.answer ?? ''
        setExtra((prev) => ({
          ...prev,
          [assistantId]: {
            reasoning: data?.reasoning ?? [],
            sql: data?.sql ?? null,
            chart: data?.chart ?? null,
          },
        }))
        // 流式把答案逐字灌进 assistant 消息
        for (let i = 1; i <= answer.length; i++) {
          setMessages(
            messagesRef.current.map((m) =>
              m.id === assistantId ? { ...m, content: answer.slice(0, i) } : m,
            ),
          )
          await sleep(16)
        }
        setMessages(
          messagesRef.current.map((m) =>
            m.id === assistantId
              ? { ...m, content: answer, status: { type: 'complete', reason: 'stop' } }
              : m,
          ),
        )
      } catch (err) {
        const msg =
          err?.response?.data?.detail ?? '暂时无法连接后端服务，请确认 FastAPI 已在 8000 端口启动。'
        setMessages(
          messagesRef.current.map((m) =>
            m.id === assistantId
              ? { ...m, content: msg, status: { type: 'incomplete', reason: 'error' } }
              : m,
          ),
        )
        setExtra((prev) => ({ ...prev, [assistantId]: { error: true } }))
      }
    },
  })
  runtimeRef.current = runtime
  const thread = runtime.thread

  function sendText(q) {
    if (!q || isRunning) return
    thread.composer.setText(q)
    thread.composer.send()
  }

  function send() {
    const q = input.trim()
    if (!q || isRunning) return
    setInput('')
    sendText(q)
  }

  function logout() {
    localStorage.removeItem('askdata_token')
    localStorage.removeItem('askdata_user')
    navigate('/login')
  }

  const user = JSON.parse(localStorage.getItem('askdata_user') || '{}')
  const bodyRef = useRef(null)
  const scrollBottom = () =>
    requestAnimationFrame(() =>
      bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' }),
    )

  return (
    <AssistantRuntimeProvider runtime={runtime}>
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

        <main className="chat-main" ref={bodyRef}>
          {messages.length === 0 && (
            <div className="chat-empty">
              <p>你好，{user?.name || '我是 AskData'} 👋</p>
              <p>用一句话提问，我会从你的数据里找出可追溯、可解释的答案。</p>
              <div className="chips">
                <button className="chip" onClick={() => { setInput('上个月销售额前五的产品分别卖了多少？'); requestAnimationFrame(() => { setInput('上个月销售额前五的产品分别卖了多少？') }) }}>
                  上个月销售额 Top 5
                </button>
                <button className="chip" onClick={() => { setInput('上周新增用户的第七天留存率是多少？'); requestAnimationFrame(() => { setInput('上周新增用户的第七天留存率是多少？') }) }}>
                  上周 D7 留存率
                </button>
              </div>
            </div>
          )}

          {messages.map((m) => {
            const x = extra[m.id] || {}
            const thinking = m.role === 'assistant' && m.status?.type === 'running' && !m.content
            return (
              <div key={m.id} className={`msg ${m.role}`}>
                <div className="msg-avatar">{m.role === 'assistant' ? '◆' : '你'}</div>
                <div className="msg-body">
                  <div className={`bubble ${m.role}${extra[m.id]?.error ? ' error' : ''}`}>
                    {thinking ? (
                      <span className="bubble-thinking">
                        <span className="dot"></span><span className="dot"></span><span className="dot"></span>
                        <em>正在分析你的数据…</em>
                      </span>
                    ) : (
                      extractText(m.content)
                    )}
                  </div>

                  {m.role === 'assistant' && x.chart?.type === 'bar' && <ChartBars chart={x.chart} />}

                  {m.role === 'assistant' && x?.reasoning?.length > 0 && (
                    <details className="trace">
                      <summary>推理过程（可追溯）</summary>
                      <ol>{x.reasoning.map((s, i) => <li key={i}>{s}</li>)}</ol>
                    </details>
                  )}

                  {m.role === 'assistant' && x?.sql && (
                    <details className="trace">
                      <summary>生成查询 SQL</summary>
                      <pre>{x.sql}</pre>
                    </details>
                  )}
                </div>
              </div>
            )
          })}
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
            <button className="send" onClick={send} disabled={isRunning || !input.trim()}>发送</button>
          </div>
          <p className="composer-hint">Enter 发送 · Shift + Enter 换行</p>
        </footer>
      </div>
    </AssistantRuntimeProvider>
  )
}
