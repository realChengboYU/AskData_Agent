import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AssistantRuntimeProvider, useExternalStoreRuntime } from '@assistant-ui/react'
import { Thread } from '@/components/thread.aui'
import { TooltipProvider } from '@/components/ui/tooltip'
import { askQuestion } from '../api'
import './chat.css'

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
  const messagesRef = useRef([])

  const setMessages = (msgs) => {
    messagesRef.current = msgs
    setMessagesState(msgs)
  }

  const isRunning = messagesRef.current.some(
    (m) => m.role === 'assistant' && m.status?.type === 'running',
  )

  const runtime = useExternalStoreRuntime({
    messages,
    setMessages,
    isRunning,
    convertMessage: (m) => m,
    onNew: async (message) => {
      const question = extractText(message.content).trim()
      if (!question) return
      const assistantId = makeId()

      const last = messagesRef.current[messagesRef.current.length - 1]
      const lastIsSameUser =
        last?.role === 'user' && extractText(last?.content ?? '').trim() === question
      const base = lastIsSameUser
        ? messagesRef.current
        : [...messagesRef.current, { id: last?.id ?? makeId(), role: 'user', content: question }]
      setMessages([
        ...base,
        { id: assistantId, role: 'assistant', content: [{ type: 'text', text: '' }], status: { type: 'running' } },
      ])

      try {
        const data = await askQuestion({ question })
        const answer = data?.answer ?? ''
        const reasons = data?.reasoning ?? []
        const sql = data?.sql ?? null
        const finalContent = [
          { type: 'text', text: answer },
          ...(sql ? [{ type: 'text', text: `\`\`\`sql\n${sql}\n\`\`\`` }] : []),
          ...(reasons.length ? [{ type: 'reasoning', text: reasons.join('\n') }] : []),
        ]

        // 流式：先逐字输答案，再补推理 / SQL
        for (let i = 1; i <= answer.length; i++) {
          setMessages(
            messagesRef.current.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: (Array.isArray(m.content) ? m.content : [{ type: 'text', text: '' }]).map(
                      (p, j) => (j === 0 && p.type === 'text' ? { ...p, text: answer.slice(0, i) } : p),
                    ),
                  }
                : m,
            ),
          )
          await sleep(16)
        }
        setMessages(
          messagesRef.current.map((m) =>
            m.id === assistantId
              ? { ...m, content: finalContent, status: { type: 'complete', reason: 'stop' } }
              : m,
          ),
        )
      } catch (err) {
        const msg =
          err?.response?.data?.detail ?? '暂时无法连接后端服务，请确认 FastAPI 已在 8000 端口启动。'
        setMessages(
          messagesRef.current.map((m) =>
            m.id === assistantId
              ? { ...m, content: [{ type: 'text', text: msg }], status: { type: 'incomplete', reason: 'error' } }
              : m,
          ),
        )
      }
    },
  })

  function logout() {
    localStorage.removeItem('askdata_token')
    localStorage.removeItem('askdata_user')
    navigate('/login')
  }

  const user = JSON.parse(localStorage.getItem('askdata_user') || '{}')

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <TooltipProvider>
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
          <main className="chat-body">
            <Thread />
          </main>
        </div>
      </TooltipProvider>
    </AssistantRuntimeProvider>
  )
}
