import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AssistantChat from '@/components/assistant-chat'
import DataSources from './DataSources'
import { ApiOutlined, BookOutlined, CaretDownOutlined, CheckOutlined, CloseOutlined, DatabaseOutlined, DeleteOutlined, DownloadOutlined, DoubleLeftOutlined, EditOutlined, LoadingOutlined, MessageOutlined, PlusOutlined, PlusSquareOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons'
import { LANGS, LANG_LABELS, useI18n } from '../i18n'
import { deleteSession, exportSession, getHistory, getSessions, renameSession, getDataSources, setSessionDataSource, getLlmConfig, saveLlmConfig, testLlmConfig } from '../api'
import pgIcon from '../assets/ds/pg.svg'
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
      // 工具调用信息（复用思考样式，可折叠展示）
      if (Array.isArray(m.tools)) {
        for (const tool of m.tools) {
          parts.push({
            type: 'tool-call',
            toolCallId: makeId(),
            toolName: tool?.name,
            args: tool?.args,
            result: tool?.result,
          })
        }
      }
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

// 设置按钮：点击打开设置弹窗
function SettingsButton({ onOpen }) {
  const { t } = useI18n()
  return (
    <button type="button" className="chat-settings" aria-label={t('settings')} title={t('settings')} onClick={onOpen}>
      <SettingOutlined />
      <span className="settings-label">{t('settings')}</span>
    </button>
  )
}

// 设置弹窗：① 对话模型配置（Base URL / 名称 / API Key + 测试连接）② 语言
function SettingsModal({ open, onClose }) {
  const { lang, setLang, t } = useI18n()
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // 打开时读取当前生效配置；关闭时重置一次性状态
  useEffect(() => {
    if (!open) return
    setApiKey('')
    setTestResult(null)
    setSaved(false)
    getLlmConfig()
      .then((d) => {
        setBaseUrl(d?.base_url || '')
        setModel(d?.model || '')
        setHasKey(!!d?.has_key)
      })
      .catch(() => {})
  }, [open])

  // Esc 关闭
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const doTest = () => {
    setTesting(true)
    setTestResult(null)
    testLlmConfig({ base_url: baseUrl, model, api_key: apiKey })
      .then((r) => setTestResult({ ok: !!r?.ok, msg: r?.message || '' }))
      .catch((e) => setTestResult({ ok: false, msg: e?.response?.data?.message || String(e) }))
      .finally(() => setTesting(false))
  }

  const doSave = () => {
    setSaving(true)
    saveLlmConfig({ base_url: baseUrl, model, api_key: apiKey })
      .then(() => {
        if (apiKey.trim()) setHasKey(true)
        setSaved(true)
        setTimeout(() => setSaved(false), 2400)
      })
      .catch(() => {})
      .finally(() => setSaving(false))
  }

  return (
    <div
      className="settings-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="settings-panel" role="dialog" aria-modal="true" aria-label={t('settings')}>
        <header className="settings-head">
          <span className="settings-title">{t('settings')}</span>
          <button type="button" className="settings-close" onClick={onClose} aria-label={t('close')}>
            <CloseOutlined />
          </button>
        </header>

        <div className="settings-body">
          <section className="settings-section">
            <div className="settings-section-title">{t('settings.model')}</div>
            <p className="settings-section-sub">{t('settings.modelSub')}</p>

            <div className="settings-field">
              <label className="settings-field-label" htmlFor="set-baseurl">
                {t('settings.baseUrl')}
              </label>
              <input
                id="set-baseurl"
                className="settings-input mono"
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://host:port/v1"
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            <div className="settings-field">
              <label className="settings-field-label" htmlFor="set-model">
                {t('settings.modelName')}
              </label>
              <input
                id="set-model"
                className="settings-input mono"
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="gpt-4o-mini"
                spellCheck={false}
                autoComplete="off"
              />
            </div>
            <div className="settings-field">
              <label className="settings-field-label" htmlFor="set-key">
                {t('settings.apiKey')}
              </label>
              <input
                id="set-key"
                className="settings-input mono"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={hasKey ? t('settings.apiKeyKeep') : t('settings.apiKeyPh')}
                spellCheck={false}
                autoComplete="off"
              />
            </div>

            <div className="settings-test-row">
              <button type="button" className="settings-btn ghost" onClick={doTest} disabled={testing}>
                {testing ? <LoadingOutlined spin /> : <ApiOutlined />}
                <span>{testing ? t('settings.testing') : t('settings.test')}</span>
              </button>
              {testResult && (
                <span className={`settings-test-result ${testResult.ok ? 'ok' : 'err'}`}>{testResult.msg}</span>
              )}
            </div>
          </section>

          <section className="settings-section">
            <div className="settings-section-title">{t('language')}</div>
            <div className="settings-lang">
              {LANGS.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={`lang-opt${lang === l ? ' active' : ''}`}
                  onClick={() => setLang(l)}
                >
                  <span className="lang-flag">{l === 'zh' ? '中' : 'EN'}</span>
                  <span className="lang-label">{LANG_LABELS[l]}</span>
                  {lang === l && <CheckOutlined className="lang-check" />}
                </button>
              ))}
            </div>
          </section>
        </div>

        <footer className="settings-foot">
          <span className={`settings-saved-tip${saved ? ' show' : ''}`}>{t('settings.saved')}</span>
          <button type="button" className="settings-btn primary" onClick={doSave} disabled={saving}>
            {saving ? t('settings.saving') : t('settings.save')}
          </button>
        </footer>
      </div>
    </div>
  )
}

// 数据源切换器：每个会话窗口只针对一个库对话，可在此切换（切换会持久化到该会话）
function DsSwitcher({ value, sources, onChange, t }) {
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

  const cur = sources.find((s) => s.id === value)
  return (
    <div className="ds-switcher" ref={wrapRef}>
      <button
        type="button"
        className="ds-switcher-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={t('ds.switchSource')}
        onClick={() => setOpen((o) => !o)}
      >
        <img className="ds-switcher-ic" src={pgIcon} width={16} height={16} alt="" aria-hidden="true" />
        <span className="ds-switcher-label">{cur ? cur.name : t('ds.none')}</span>
        <CaretDownOutlined className={`ds-switcher-caret${open ? ' open' : ''}`} />
      </button>
      {open && (
        <div className="ds-switcher-menu" role="listbox">
          {sources.length === 0 ? (
            <div className="ds-switcher-empty">{t('ds.noSource')}</div>
          ) : (
            sources.map((s) => (
              <button
                key={s.id}
                type="button"
                role="option"
                aria-selected={s.id === value}
                className={`ds-switcher-opt${s.id === value ? ' active' : ''}`}
                onClick={() => { onChange(s.id); setOpen(false) }}
              >
                <span className="ds-switcher-opt-main">{s.name}</span>
                <span className="ds-switcher-opt-sub">{s.dbname ? `/${s.dbname}` : ''}</span>
                {s.id === value ? <CheckOutlined className="ds-switcher-opt-check" /> : null}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default function Chat() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [dsView, setDsView] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // 当前会话绑定的数据源 id（每次对话只针对一个库；会话内可切换）
  const [currentDsId, setCurrentDsId] = useState(null)
  // 数据源列表（供顶部切换器 / 「使用中」默认）
  const [dataSources, setDataSources] = useState([])
  const dsInitializedRef = useRef(false)
  // 当前会话的历史消息（原始后端结构，交给 AssistantChat 转成 UI）
  const [historyMessages, setHistoryMessages] = useState([])
  // 每次历史重新加载都 +1，用作 AssistantChat 的 key 的一部分：
  // 运行结束后重新拉取历史让消息结构刷新，避免流式状态被覆盖后答案“消失”。
  const [historyVersion, setHistoryVersion] = useState(0)
  const [sessions, setSessions] = useState([])
  // 正在重命名的会话 id（null=不处于重命名态）
  const [renamingId, setRenamingId] = useState(null)
  const [renameInput, setRenameInput] = useState('')
  // 对话列宽度（rem）。悬停对话条左右边缘拖拽可调，限 50–72rem，持久化到 localStorage。
  const [threadWidth, setThreadWidth] = useState(() => {
    const v = Number(localStorage.getItem('askdata_chat_width'))
    if (Number.isFinite(v) && v >= 50 && v <= 72) return v
    return 60
  })
  const handleResizeWidth = (rem) => {
    const v = Math.min(72, Math.max(50, Math.round(rem)))
    setThreadWidth(v)
    localStorage.setItem('askdata_chat_width', String(v))
  }
  // 会话 id 存到 localStorage，刷新后仍能恢复同一个对话（含模型历史消息）
  const sessionIdRef = useRef(localStorage.getItem('askdata_session') || makeId())

  // 从后端拉取历史消息并填充到当前会话。
  // 用 sessionIdRef.current 做守卫：快速切换会话时，旧会话的异步返回不会覆盖新会话，保证历史隔离。
  const loadHistory = (sid) => {
    getHistory(sid)
      .then((data) => {
        if (sessionIdRef.current !== sid) return
        setHistoryMessages(data?.messages ?? [])
        setHistoryVersion((v) => v + 1)
      })
      .catch(() => {
        if (sessionIdRef.current !== sid) return
        setHistoryMessages([])
        setHistoryVersion((v) => v + 1)
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
      .then((data) => {
        const backend = data?.sessions ?? []
        setSessions((prev) => mergeSessions(prev, backend))
        // 仅首次：用后端持久化的绑定初始化当前会话的数据源（不覆盖会话内的手动切换）
        if (!dsInitializedRef.current) {
          dsInitializedRef.current = true
          const cur = backend.find((s) => s.session_id === sessionIdRef.current)
          setCurrentDsId(cur ? cur.data_source_id || null : null)
        }
      })
      .catch(() => setSessions((prev) => mergeSessions(prev, [])))
  }

  // 每次运行结束：刷新会话列表，并重新拉取当前会话历史。
  // 重新拉取会让 initialMessages 带上刚生成的回答，AssistantChat 随 key 变更重挂载，
  // 从而修复「答案出现后又消失」。
  const handleRunFinish = () => {
    refreshSessions()
    loadHistory(sessionIdRef.current)
  }

  // 切换到指定会话：更新 session id，并加载它的历史 + 该会话绑定的数据源
  const openSession = (sid) => {
    setDsView(false)
    if (!sid || sid === sessionIdRef.current) return
    sessionIdRef.current = sid
    localStorage.setItem('askdata_session', sid)
    const found = sessions.find((s) => s.session_id === sid)
    setCurrentDsId(found ? found.data_source_id || null : null)
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
            setHistoryMessages([])
          }
        }
      })
      .catch(() => {})
  }

  // 进入重命名态：填入当前标题，显示输入框
  const startRename = (s) => {
    setRenamingId(s.session_id)
    setRenameInput(s.title || '')
  }

  // 提交重命名：调用后端，更新本地列表标题
  const submitRename = (sid) => {
    const title = renameInput.trim()
    renameSession(sid, title)
      .then(() => {
        setSessions((prev) =>
          prev.map((s) =>
            s.session_id === sid ? { ...s, title: title || s.title } : s,
          ),
        )
      })
      .catch(() => {})
      .finally(() => {
        setRenamingId(null)
        setRenameInput('')
      })
  }

  const cancelRename = () => {
    setRenamingId(null)
    setRenameInput('')
  }

  // 导出会话为 Markdown：后端返回 Blob，触发下载
  const exportThisSession = (sid) => {
    exportSession(sid)
      .then((blob) => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `deepdata-${(sid || 'session').slice(0, 8)}.md`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      })
      .catch(() => {})
  }

  // 挂载时：持久化会话 id，恢复历史消息，加载侧栏「会话列表」
  useEffect(() => {
    localStorage.setItem('askdata_session', sessionIdRef.current)
    loadHistory(sessionIdRef.current)
    refreshSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 每次处于对话视图都刷新数据源列表（新建 / 编辑数据源后，切换器保持最新）
  useEffect(() => {
    if (!dsView) loadDataSources()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dsView])

  function logout() {
    localStorage.removeItem('askdata_token')
    localStorage.removeItem('askdata_user')
    navigate('/login')
  }

  function newChat() {
    setDsView(false)
    sessionIdRef.current = makeId()
    localStorage.setItem('askdata_session', sessionIdRef.current)
    setHistoryMessages([])
    // 新建会话默认绑定「使用中」的数据源（没有则为空，可在顶部切换器选择）
    const activeId = dataSources.find((d) => d.is_active)?.id || null
    setCurrentDsId(activeId)
    setSessions((prev) => [
      { session_id: sessionIdRef.current, title: '（新会话）', updated_at: '', message_count: 0, data_source_id: activeId },
      ...prev.filter((s) => s.session_id !== sessionIdRef.current),
    ])
    if (activeId) setSessionDataSource(sessionIdRef.current, activeId)
  }

  // 从某数据源卡片「直接问数」：新建一个会话并绑定该数据源，然后进入对话视图
  function newChatWithSource(dsId) {
    sessionIdRef.current = makeId()
    localStorage.setItem('askdata_session', sessionIdRef.current)
    setHistoryMessages([])
    setDsView(false)
    setCurrentDsId(dsId || null)
    setSessions((prev) => [
      { session_id: sessionIdRef.current, title: '（新会话）', updated_at: '', message_count: 0, data_source_id: dsId || null },
      ...prev.filter((s) => s.session_id !== sessionIdRef.current),
    ])
    if (dsId) setSessionDataSource(sessionIdRef.current, dsId)
  }

  // 会话内切换数据源：更新本地状态 + 持久化到该会话
  const switchDs = (dsId) => {
    if (dsId === currentDsId) return
    const sid = sessionIdRef.current
    setCurrentDsId(dsId || null)
    setSessions((prev) => prev.map((s) => (s.session_id === sid ? { ...s, data_source_id: dsId || null } : s)))
    if (sid) setSessionDataSource(sid, dsId)
  }

  // 拉取数据源列表（供顶部切换器 + 「使用中」默认）
  const loadDataSources = () => {
    getDataSources()
      .then((d) => setDataSources(d?.sources ?? []))
      .catch(() => setDataSources([]))
  }

  const user = JSON.parse(localStorage.getItem('askdata_user') || '{}')

  return (
    <div className="chat">
          <aside className={`chat-sidebar${sidebarOpen ? '' : ' collapsed'}${dsView ? ' in-ds' : ''}`}>
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

            <button type="button" className="side-new" onClick={() => (dsView ? setDsView(false) : newChat())}>
              {dsView ? <MessageOutlined /> : <PlusOutlined />}
              <span>{dsView ? t('ds.backChat') : t('newChat')}</span>
            </button>

            <div className="side-icons">
              <button type="button" className="side-icon" title={t('newChat')} onClick={newChat}>
                <MessageOutlined />
                <span className="side-icon-label">{t('newChat')}</span>
              </button>
              <button type="button" className="side-icon" title={t('nav.kb')}>
                <BookOutlined />
                <span className="side-icon-label">{t('nav.kb')}</span>
              </button>
              <button type="button" className={`side-icon${dsView ? ' active' : ''}`} title={t('ds.title')} onClick={() => setDsView(true)}>
                <DatabaseOutlined />
                <span className="side-icon-label">{t('ds.title')}</span>
              </button>
              <button type="button" className="side-icon" title={t('nav.window')}>
                <PlusSquareOutlined />
                <span className="side-icon-label">{t('nav.window')}</span>
              </button>
              <button type="button" className="side-icon" title={t('nav.search')}>
                <SearchOutlined />
                <span className="side-icon-label">{t('nav.search')}</span>
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
                    {renamingId === s.session_id ? (
                      <div
                        className="side-session-rename"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          className="side-session-rename-input"
                          value={renameInput}
                          autoFocus
                          onChange={(e) => setRenameInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') submitRename(s.session_id)
                            if (e.key === 'Escape') cancelRename()
                          }}
                        />
                        <button
                          type="button"
                          className="side-session-rename-ok"
                          title="确认"
                          aria-label="确认"
                          onClick={() => submitRename(s.session_id)}
                        >
                          <CheckOutlined />
                        </button>
                        <button
                          type="button"
                          className="side-session-rename-cancel"
                          title="取消"
                          aria-label="取消"
                          onClick={cancelRename}
                        >
                          <CloseOutlined />
                        </button>
                      </div>
                    ) : (
                      <>
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
                          className="side-session-action"
                          title="重命名"
                          aria-label="重命名"
                          onClick={(e) => {
                            e.stopPropagation()
                            startRename(s)
                          }}
                        >
                          <EditOutlined />
                        </button>
                        <button
                          type="button"
                          className="side-session-action"
                          title="导出 Markdown"
                          aria-label="导出"
                          onClick={(e) => {
                            e.stopPropagation()
                            exportThisSession(s.session_id)
                          }}
                        >
                          <DownloadOutlined />
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
                      </>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="side-footer">
              <SettingsButton onOpen={() => setSettingsOpen(true)} />
            </div>
          </aside>

          <div className={`chat-main${dsView ? ' is-ds' : ''}`} style={{ ['--thread-max-width']: `${threadWidth}rem` }}>
            {/* 两个视图都保持挂载，用 display 切换：切到数据源再返回时，
                AssistantChat 的内部状态（滚动 / 草稿 / 展开的思考 / 进行中的流）得以保留。 */}
            <div className={`chat-view${dsView ? ' hidden' : ''}`}>
              <header className="chat-head">
                <div className="chat-head-left">
                  <DsSwitcher value={currentDsId} sources={dataSources} onChange={switchDs} t={t} />
                </div>
                <div className="chat-head-right">
                  <span className="chat-user">{user?.name || 'deepdata'}</span>
                  <button className="chat-logout" onClick={logout}>{t('logout')}</button>
                </div>
              </header>
              <main className="chat-body">
                <AssistantChat
                  key={`${sessionIdRef.current}:${historyVersion}`}
                  threadId={sessionIdRef.current}
                  dataSourceId={currentDsId}
                  initialMessages={historyMessages}
                  onFinish={handleRunFinish}
                  onResizeWidth={handleResizeWidth}
                />
              </main>
            </div>
            {dsView && (
              <div className="ds-view">
                <DataSources onBackToChat={() => setDsView(false)} onAsk={newChatWithSource} />
              </div>
            )}
          </div>

          <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </div>
  )
}
