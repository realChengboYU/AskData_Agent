import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AssistantRuntimeProvider, useExternalStoreRuntime } from '@assistant-ui/react'
import { Thread } from '@/components/thread.aui'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ComposerControlsContext } from '@/components/promptbar/controls'
import { BookOutlined, CheckOutlined, DeleteOutlined, DoubleLeftOutlined, MessageOutlined, PlusOutlined, PlusSquareOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons'
import { LANGS, LANG_LABELS, useI18n } from '../i18n'
import { askQuestionStream, deleteSession, getHistory, getSessions } from '../api'
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

// 后端历史消息 -> assistant-ui 消息结构（status 只能出现在 assistant 消息上）
function mapHistory(data) {
  return (data?.messages ?? []).map((m) => {
    const isAssistant = m.role === 'assistant'
    let parts = []
    if (isAssistant) {
      // 把模型 thinking 放在正文前，渲染成可折叠的「思考过程」
      if (m.reasoning) parts.push({ type: 'reasoning', text: m.reasoning })
      parts.push({ type: 'text', text: m.content })
    }
    return {
      id: makeId(),
      role: m.role,
      content: isAssistant ? parts : m.content,
      ...(isAssistant ? { status: { type: 'complete', reason: 'stop' } } : {}),
    }
  })
}

// 设置按钮：点击展开语言切换（简体中文 / English）
function SettingsButton() {
  const { lang, setLang, t } = useI18n()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className="settings-wrap" ref={wrapRef}>
      <button
        type="button"
        className="chat-settings"
        aria-label={t('settings')}
        title={t('settings')}
        onClick={() => setOpen((o) => !o)}
      >
        <SettingOutlined />
        <span className="settings-label">{t('settings')}</span>
      </button>
      {open && (
        <div className="settings-pop">
          <div className="settings-title">{t('language')}</div>
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              className={`lang-opt${lang === l ? ' active' : ''}`}
              onClick={() => {
                setLang(l)
                setOpen(false)
              }}
            >
              <span className="lang-flag">{l === 'zh' ? '中' : 'EN'}</span>
              <span className="lang-label">{LANG_LABELS[l]}</span>
              {lang === l && <CheckOutlined className="lang-check" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Chat() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [messages, setMessagesState] = useState([])
  const [sessions, setSessions] = useState([])
  const messagesRef = useRef([])
  // 会话 id 存到 localStorage，刷新后仍能恢复同一个对话（含模型历史消息）
  const sessionIdRef = useRef(localStorage.getItem('askdata_session') || makeId())
  // 当前正在生成的请求控制器，供 PromptBar 的「停止」按钮取消
  const stopRef = useRef(null)

  const setMessages = (msgs) => {
    messagesRef.current = msgs
    setMessagesState(msgs)
  }

  // 从后端拉取历史消息并填充到当前会话。
  // 用 sessionIdRef.current 做守卫：快速切换会话时，旧会话的异步返回不会覆盖新会话，保证历史隔离。
  const loadHistory = (sid) => {
    getHistory(sid)
      .then((data) => {
        if (sessionIdRef.current !== sid) return
        setMessages(data?.messages?.length ? mapHistory(data) : [])
      })
      .catch(() => {
        if (sessionIdRef.current !== sid) return
        setMessages([])
      })
  }

  // 合并后端会话 + 本地“新建但还没发消息”的空会话占位，并把当前会话放到最前。
  // 这样：点击“新建会话”会新增一行；每个会话（含其全部历史）对应一行。
  const mergeSessions = (prev, backend) => {
    const backendIds = new Set(backend.map((s) => s.session_id))
    const list = [...backend]
    // 保留之前列表里、尚未写入后端且暂无消息的空会话（新建后还没发消息的占位行）
    for (const s of prev) {
      if (!backendIds.has(s.session_id) && s.message_count === 0) {
        list.push(s)
      }
    }
    // 当前会话置顶（没有就补一个“（新会话）”占位）
    const cur = sessionIdRef.current
    const curItem =
      list.find((s) => s.session_id === cur) ??
      ({ session_id: cur, title: '（新会话）', updated_at: '', message_count: 0 })
    return [curItem, ...list.filter((s) => s.session_id !== cur)]
  }

  // 刷新侧栏「会话列表」
  const refreshSessions = () => {
    getSessions()
      .then((data) => setSessions((prev) => mergeSessions(prev, data?.sessions ?? [])))
      .catch(() => setSessions((prev) => mergeSessions(prev, [])))
  }

  // 切换到指定会话：更新 session id，并加载它的历史
  const openSession = (sid) => {
    if (!sid || sid === sessionIdRef.current) return
    sessionIdRef.current = sid
    localStorage.setItem('askdata_session', sid)
    loadHistory(sid)
  }

  // 删除某个历史会话：调用后端删除，并从列表中移除。
  // 若删的是「当前会话」，优先切到最近一个「有消息」的剩余会话（不弹“新建会话”）；都没有则清空为空白对话（也不新增占位行）。
  const removeSession = (sid) => {
    if (!window.confirm('确定删除该会话？此操作不可撤销')) return
    deleteSession(sid)
      .then(() => {
        const rest = sessions.filter((s) => s.session_id !== sid)
        setSessions(rest)
        if (sid === sessionIdRef.current) {
          const withMsgs = rest.filter((s) => (s.message_count ?? 0) > 0)
          const next = withMsgs[0] ?? rest[0]
          if (next) {
            // 切到剩余会话（优先有消息的），不再新建会话
            openSession(next.session_id)
          } else {
            // 没有剩余会话：重置为空白对话，但不新增“（新会话）”行
            sessionIdRef.current = makeId()
            localStorage.setItem('askdata_session', sessionIdRef.current)
            messagesRef.current = []
            setMessagesState([])
          }
        }
      })
      .catch(() => {})
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
      // 记录这条消息属于哪个会话：之后即使用户切走，也不会把回应注入别的会话
      const askSession = sessionIdRef.current
      const assistantId = makeId()

      const last = messagesRef.current[messagesRef.current.length - 1]
      const lastIsSameUser =
        last?.role === 'user' && extractText(last?.content ?? '').trim() === question
      const base = lastIsSameUser
        ? messagesRef.current
        : [...messagesRef.current, { id: last?.id ?? makeId(), role: 'user', content: question }]
      // 助手占位：thinking 与正文两个 part，流式期间 thinking part 标记为 running 以自动展开
      setMessages([
        ...base,
        {
          id: assistantId,
          role: 'assistant',
          content: [
            { type: 'reasoning', text: '', status: { type: 'running' } },
            { type: 'text', text: '' },
          ],
          status: { type: 'running' },
        },
      ])

      // 实时把增量追加到指定 part
      const appendDelta = (type, delta) => {
        setMessages(
          messagesRef.current.map((m) => {
            if (m.id !== assistantId) return m
            const parts = Array.isArray(m.content) ? m.content : []
            return {
              ...m,
              content: parts.map((p) =>
                p.type === type ? { ...p, text: (p.text || '') + delta } : p,
              ),
            }
          }),
        )
      }

      const ctrl = new AbortController()
      stopRef.current = ctrl
      try {
        // 消费 SSE：thinking 与正文逐块实时显示，完成后 resolve
        await askQuestionStream(
          { question, session_id: askSession },
          {
            onReasoning: (delta) => appendDelta('reasoning', delta),
            onText: (delta) => appendDelta('text', delta),
            signal: ctrl.signal,
          },
        )

        // 本条已写入后端，无论是否切走都刷新会话列表（让该会话标题/条目生效）
        refreshSessions()
        // 若用户已切到别的会话，就不再往当前视图注入这条回应（切回 askSession 时会加载到）
        if (sessionIdRef.current !== askSession) return

        // 完成：收起 thinking 展开态并标记完成
        setMessages(
          messagesRef.current.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: (Array.isArray(m.content) ? m.content : []).map((p) =>
                    p.type === 'reasoning' ? { ...p, status: { type: 'complete' } } : p,
                  ),
                  status: { type: 'complete', reason: 'stop' },
                }
              : m,
          ),
        )
      } catch (err) {
        // 已切到别的会话，就不在别的会话里显示这个错误
        if (sessionIdRef.current !== askSession) return
        const isCancel =
          err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.name === 'AbortError'
        if (isCancel) {
          // 用户点了「停止」：把占位回复标记为中断，避免一直卡在“生成中”
          setMessages(
            messagesRef.current.map((m) =>
              m.id === assistantId
                ? { ...m, status: { type: 'incomplete', reason: 'error' } }
                : m,
            ),
          )
          return
        }
        const msg = err?.message ?? err?.response?.data?.detail ?? '暂时无法连接后端服务，请确认 FastAPI 已在 8100 端口启动。'
        setMessages(
          messagesRef.current.map((m) =>
            m.id === assistantId
              ? { ...m, content: [{ type: 'text', text: msg }], status: { type: 'incomplete', reason: 'error' } }
              : m,
          ),
        )
      } finally {
        if (stopRef.current === ctrl) stopRef.current = null
      }
    },
  })

  // 挂载时：持久化会话 id，恢复历史消息，并加载侧栏「会话列表」
  useEffect(() => {
    localStorage.setItem('askdata_session', sessionIdRef.current)
    loadHistory(sessionIdRef.current)
    refreshSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function logout() {
    localStorage.removeItem('askdata_token')
    localStorage.removeItem('askdata_user')
    navigate('/login')
  }

  function newChat() {
    sessionIdRef.current = makeId()
    localStorage.setItem('askdata_session', sessionIdRef.current)
    messagesRef.current = []
    setMessagesState([])
    // 直接在列表顶部新增一行（当前空会话），保留其它会话行
    setSessions((prev) => [
      { session_id: sessionIdRef.current, title: '（新会话）', updated_at: '', message_count: 0 },
      ...prev.filter((s) => s.session_id !== sessionIdRef.current),
    ])
  }

  const user = JSON.parse(localStorage.getItem('askdata_user') || '{}')

  // PromptBar：发送走 assistant-ui runtime 的 onNew（thread.append 触发）；「停止」取消当前正在生成的请求
  const composerControls = useMemo(
    () => ({
      onStop: () => stopRef.current?.abort(),
      send: (msg) => runtime.thread.append(msg),
    }),
    [runtime],
  )

  return (
    <ComposerControlsContext.Provider value={composerControls}>
    <AssistantRuntimeProvider runtime={runtime}>
      <TooltipProvider>
        <div className="chat">
          <aside className={`chat-sidebar${sidebarOpen ? '' : ' collapsed'}`}>
            <div className="side-brand">
              <img
                className="side-mark"
                src="/dog.png"
                alt="DeepData"
                onClick={() => setSidebarOpen(true)}
              />
              <span className="side-name deepdata-word">deepdata</span>
              <button
                type="button"
                className="side-toggle"
                aria-label={t('toggleSidebar')}
                title={t('toggleSidebar')}
                onClick={() => setSidebarOpen((o) => !o)}
              >
                <DoubleLeftOutlined />
              </button>
            </div>

            <button type="button" className="side-new" onClick={newChat}>
              <PlusOutlined />
              <span>{t('newChat')}</span>
            </button>

            <div className="side-icons">
              <button type="button" className="side-icon" title={t('newChat')} onClick={newChat}>
                <MessageOutlined />
              </button>
              <button type="button" className="side-icon" title="知识库">
                <BookOutlined />
              </button>
              <button type="button" className="side-icon" title="新建窗口">
                <PlusSquareOutlined />
              </button>
              <button type="button" className="side-icon" title="搜索">
                <SearchOutlined />
              </button>
            </div>

            <div className="side-section">{t('sessions')}</div>
            <div className="side-sessions">
              {sessions.length === 0 ? (
                <div className="side-empty">{t('noSessions')}</div>
              ) : (
                sessions.map((s) => (
                  <div
                    key={s.session_id}
                    className={`side-session${s.session_id === sessionIdRef.current ? ' active' : ''}`}
                  >
                    <button
                      type="button"
                      className="side-session-open"
                      onClick={() => openSession(s.session_id)}
                      title={s.title}
                    >
                      <MessageOutlined className="side-session-icon" />
                      <span className="side-session-title">{s.title}</span>
                    </button>
                    <button
                      type="button"
                      className="side-session-del"
                      title="删除会话"
                      aria-label="删除会话"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeSession(s.session_id)
                      }}
                    >
                      <DeleteOutlined />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="side-footer">
              <SettingsButton />
            </div>
          </aside>

          <div className="chat-main">
            <header className="chat-head">
              <div className="chat-head-right">
                <span className="chat-user">{user?.name || 'deepdata'}</span>
                <button className="chat-logout" onClick={logout}>{t('logout')}</button>
              </div>
            </header>
            <main className="chat-body">
              <Thread />
            </main>
          </div>
        </div>
      </TooltipProvider>
    </AssistantRuntimeProvider>
    </ComposerControlsContext.Provider>
  )
}
