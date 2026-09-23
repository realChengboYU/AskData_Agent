import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircleFilled,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  LoadingOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { useI18n } from '../i18n'
import {
  createDataSource,
  deleteDataSource,
  getDataSources,
  setDataSourceActive,
  testDataSource,
  testDataSourceRaw,
  updateDataSource,
} from '../api'
import '../components/datasource/datasource.css'

// 数据库类型（当前只支持 PostgreSQL，其余为占位，供后续扩展）
const DB_TYPES = [
  { id: 'postgresql', name: 'PostgreSQL', available: true, descKey: 'ds.relation' },
  { id: 'mysql', name: 'MySQL', available: false, descKey: 'ds.relation' },
  { id: 'sqlite', name: 'SQLite', available: false, descKey: 'ds.embedded' },
]

// 连接串预览（镜像后端 build_pg_url 的结构，密码打码）
function connPreview(host, port, dbname, username, hasPassword) {
  const h = host || '主机'
  const p = port || '5432'
  const db = dbname || '数据库'
  const u = username || '用户名'
  const pw = hasPassword ? '••••••••' : '······'
  return `postgresql+psycopg://${u}:${pw}@${h}:${p}/${db}`
}

const EMPTY = { name: '', host: '', port: 5432, dbname: '', username: '', password: '' }

function DatabaseGlyph({ size = 44 }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} fill="none" aria-hidden="true">
      <ellipse cx="24" cy="12" rx="15" ry="6" stroke="currentColor" strokeWidth="2.4" />
      <path d="M9 12v24c0 3.3 6.7 6 15 6s15-2.7 15-6V12" stroke="currentColor" strokeWidth="2.4" />
      <path d="M9 24c0 3.3 6.7 6 15 6s15-2.7 15-6" stroke="currentColor" strokeWidth="2.4" opacity="0.55" />
    </svg>
  )
}

// 第 1 步：选择数据库类型
function TypeSelectStep({ onPick }) {
  const { t } = useI18n()
  const [sel, setSel] = useState('postgresql')
  const selType = DB_TYPES.find((x) => x.id === sel)
  return (
    <div className="dsrc-flow">
      <div className="dsrc-flow-head">
        <h3 className="dsrc-flow-title">{t('ds.chooseType')}</h3>
        <p className="dsrc-flow-sub">{t('ds.chooseTypeSub')}</p>
      </div>
      <div className="dsrc-types" role="radiogroup" aria-label={t('ds.chooseType')}>
        {DB_TYPES.map((tp) => {
          const selected = sel === tp.id
          return (
            <button
              key={tp.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!tp.available}
              className={`dsrc-type${selected ? ' selected' : ''}`}
              onClick={() => tp.available && setSel(tp.id)}
            >
              <span className={`dsrc-type-glyph${tp.available ? '' : ' soon'}`} aria-hidden="true">
                <DatabaseGlyph size={30} />
              </span>
              <span className="dsrc-type-body">
                <span className="dsrc-type-name">{tp.name}</span>
                <span className="dsrc-type-desc">{t(tp.descKey)}</span>
              </span>
              <span className={`dsrc-type-status${tp.available ? '' : ' soon'}`}>
                {tp.available ? t('ds.available') : t('ds.comingSoon')}
              </span>
              {selected && tp.available && (
                <span className="dsrc-type-check" aria-hidden="true">
                  <CheckCircleFilled />
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="dsrc-flow-actions">
        <button
          type="button"
          className="ds-btn ds-btn-primary"
          disabled={!selType?.available}
          onClick={() => onPick(sel)}
        >
          {t('ds.continue')}
        </button>
      </div>
    </div>
  )
}

// 第 2 步：配置连接（新建 / 编辑）
function DataSourceForm({ editing, onSaved, onError }) {
  const { t } = useI18n()
  const isEdit = !!editing
  const [form, setForm] = useState(() =>
    isEdit
      ? {
          name: editing.name || '',
          host: editing.host || '',
          port: editing.port || 5432,
          dbname: editing.dbname || '',
          username: editing.username || '',
          password: '',
        }
      : EMPTY,
  )
  const [showPwd, setShowPwd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }))
    if (k !== 'password') setTestResult(null)
  }
  const canSave = form.name.trim() && form.host.trim() && form.dbname.trim() && form.username.trim()

  async function doTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const r = await testDataSourceRaw({
        host: form.host.trim(),
        port: Number(form.port) || 5432,
        dbname: form.dbname.trim(),
        username: form.username.trim(),
        password: form.password,
      })
      setTestResult(r)
    } catch (e) {
      setTestResult({ ok: false, message: e?.response?.data?.detail || t('ds.testFail') })
    } finally {
      setTesting(false)
    }
  }

  async function save() {
    if (!canSave || saving) return
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        host: form.host.trim(),
        port: Number(form.port) || 5432,
        dbname: form.dbname.trim(),
        username: form.username.trim(),
      }
      if (isEdit) {
        if (form.password) payload.password = form.password
        await updateDataSource(editing.id, payload)
        onSaved(null)
      } else {
        payload.password = form.password || ''
        const r = await createDataSource(payload)
        onSaved(r?.id)
      }
    } catch (e) {
      onError?.(e?.response?.data?.detail || t('ds.saveFail'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dsrc-flow">
      <div className="dsrc-flow-head">
        <h3 className="dsrc-flow-title">
          {t('ds.configure')} <span className="dsrc-flow-badge">PostgreSQL</span>
        </h3>
      </div>

      <div className="ds-field">
        <label htmlFor="ds-name">{t('ds.name')}</label>
        <input
          id="ds-name"
          className="ds-input"
          value={form.name}
          placeholder="订单库"
          autoComplete="off"
          onChange={(e) => set('name', e.target.value)}
        />
      </div>

      <div className="ds-row2">
        <div className="ds-field ds-field-grow">
          <label htmlFor="ds-host">{t('ds.host')}</label>
          <input
            id="ds-host"
            className="ds-input"
            value={form.host}
            placeholder="10.0.0.5 / 主机名"
            autoComplete="off"
            onChange={(e) => set('host', e.target.value)}
          />
        </div>
        <div className="ds-field ds-field-port">
          <label htmlFor="ds-port">{t('ds.port')}</label>
          <input
            id="ds-port"
            className="ds-input"
            type="number"
            min="1"
            max="65535"
            value={form.port}
            onChange={(e) => set('port', e.target.value)}
          />
        </div>
      </div>

      <div className="ds-field">
        <label htmlFor="ds-db">{t('ds.database')}</label>
        <input
          id="ds-db"
          className="ds-input"
          value={form.dbname}
          placeholder="order_db"
          autoComplete="off"
          onChange={(e) => set('dbname', e.target.value)}
        />
      </div>

      <div className="ds-field">
        <label htmlFor="ds-user">{t('ds.username')}</label>
        <input
          id="ds-user"
          className="ds-input ds-input-mono"
          value={form.username}
          placeholder="postgres"
          autoComplete="off"
          onChange={(e) => set('username', e.target.value)}
        />
      </div>

      <div className="ds-field">
        <label htmlFor="ds-pwd">{t('ds.password')}</label>
        <div className="ds-pwd-wrap">
          <input
            id="ds-pwd"
            className="ds-input"
            type={showPwd ? 'text' : 'password'}
            value={form.password}
            placeholder={isEdit ? t('ds.passwordKeep') : t('ds.password')}
            autoComplete="new-password"
            onChange={(e) => set('password', e.target.value)}
          />
          <button
            type="button"
            className="ds-pwd-toggle"
            aria-label={showPwd ? '隐藏密码' : '显示密码'}
            onClick={() => setShowPwd((s) => !s)}
          >
            {showPwd ? <EyeInvisibleOutlined /> : <EyeOutlined />}
          </button>
        </div>
        {isEdit && !form.password && <span className="ds-hint">{t('ds.passwordKeepHint')}</span>}
      </div>

      {/* 连接串预览——随输入实时拼出（密码打码），本页唯一的重元素 */}
      <div className="ds-conn" aria-live="polite">
        <div className="ds-conn-label">{t('ds.connString')}</div>
        <code className="ds-conn-code">{connPreview(form.host, form.port, form.dbname, form.username, !!form.password)}</code>
      </div>

      {testResult && (
        <div className={`ds-test ${testResult.ok ? 'ok' : 'err'}`} role="status">
          {testResult.ok ? <CheckCircleFilled /> : <CloseOutlined />}
          <span>{testResult.message}</span>
        </div>
      )}

      <div className="ds-form-actions">
        <button
          type="button"
          className="ds-btn ds-btn-ghost"
          disabled={!canSave || testing}
          onClick={doTest}
        >
          {testing ? <LoadingOutlined spin /> : <ThunderboltOutlined />}
          {t('ds.test')}
        </button>
        <button type="button" className="ds-btn ds-btn-primary" disabled={!canSave || saving} onClick={save}>
          {saving ? <LoadingOutlined spin /> : null}
          {t('ds.save')}
        </button>
      </div>
    </div>
  )
}

// 数据源列表
function DataSourceList({ sources, activeId, busy, loading, onNew, onEdit, onSetActive, onTest, onRemove }) {
  const { t } = useI18n()
  if (!loading && sources.length === 0) {
    return (
      <div className="ds-empty dsrc-empty">
        <div className="ds-empty-mark" aria-hidden="true">
          <DatabaseGlyph />
        </div>
        <p className="ds-empty-title">{t('ds.emptyTitle')}</p>
        <p className="ds-empty-sub">{t('ds.emptySub')}</p>
        <button type="button" className="ds-btn ds-btn-primary" onClick={onNew}>
          <PlusOutlined /> {t('ds.new')}
        </button>
      </div>
    )
  }
  return (
    <div className="ds-listwrap">
      <div className="ds-list-head">
        <span className="ds-list-count">{t('ds.yours', { n: sources.length })}</span>
        <button type="button" className="ds-btn ds-btn-primary ds-btn-sm" onClick={onNew}>
          <PlusOutlined /> {t('ds.new')}
        </button>
      </div>
      <div className="ds-list dsrc-list">
        {sources.map((s) => {
          const active = s.id === activeId
          return (
            <div key={s.id} className={`ds-item${active ? ' active' : ''}`}>
              <button type="button" className="ds-item-main" onClick={() => onEdit(s)} title={t('ds.edit')}>
                <span className={`ds-item-dot${active ? ' on' : ''}`} aria-hidden="true" />
                <span className="ds-item-body">
                  <span className="ds-item-name">{s.name}</span>
                  <span className="ds-item-sub">
                    {s.username}@{s.host}:{s.port} / {s.dbname}
                  </span>
                </span>
              </button>
              <div className="ds-item-side">
                {active ? (
                  <span className="ds-active-tag">{t('ds.active')}</span>
                ) : (
                  <button
                    type="button"
                    className="ds-act-use"
                    disabled={busy === s.id}
                    onClick={() => onSetActive(s.id)}
                    title={t('ds.setActive')}
                  >
                    {t('ds.setActive')}
                  </button>
                )}
                <span className="ds-item-actions">
                  <button
                    type="button"
                    className="ds-act"
                    disabled={busy === s.id}
                    onClick={() => onTest(s.id)}
                    title={t('ds.test')}
                  >
                    {busy === s.id ? <LoadingOutlined spin /> : <ThunderboltOutlined />}
                  </button>
                  <button type="button" className="ds-act" onClick={() => onEdit(s)} title={t('ds.edit')}>
                    <EditOutlined />
                  </button>
                  <button type="button" className="ds-act ds-act-del" onClick={() => onRemove(s)} title={t('ds.delete')}>
                    <DeleteOutlined />
                  </button>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function DataSources() {
  const navigate = useNavigate()
  const { t } = useI18n()
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState('list') // 'list' | 'new' | 'edit'
  const [newStep, setNewStep] = useState('type') // 'type' | 'form'
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState('')
  const [testMsg, setTestMsg] = useState('')
  const hadActiveRef = useRef(false)

  const activeId = sources.find((s) => s.is_active)?.id ?? null

  const load = useCallback(() => {
    setLoading(true)
    getDataSources()
      .then((d) => {
        const list = d?.sources ?? []
        setSources(list)
        hadActiveRef.current = list.some((s) => s.is_active)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // ESC：表单/类型步回退一级，列表则回到对话
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && goBack()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, newStep])

  const goBack = () => {
    if (view === 'edit') return setView('list')
    if (view === 'new' && newStep === 'form') return setNewStep('type')
    if (view === 'new' && newStep === 'type') return setView('list')
    navigate('/chat')
  }

  const title =
    view === 'edit' ? t('ds.edit') : view === 'new' ? t('ds.new') : t('ds.title')

  const openNew = () => {
    setEditing(null)
    setNewStep('type')
    setTestMsg('')
    setView('new')
  }
  const openEdit = (s) => {
    setEditing(s)
    setTestMsg('')
    setView('edit')
  }

  const handleSaved = (newId) => {
    const shouldAutoActivate = !!newId && !hadActiveRef.current
    setView('list')
    setEditing(null)
    load()
    if (shouldAutoActivate) setDataSourceActive(newId).catch(() => {})
  }

  const remove = (s) => {
    if (!window.confirm(t('ds.confirmDelete', { name: s.name }))) return
    setBusy(s.id)
    deleteDataSource(s.id)
      .then(() => load())
      .catch(() => {})
      .finally(() => setBusy(''))
  }

  const doSetActive = (id) => {
    setBusy(id)
    setDataSourceActive(id)
      .then(() => load())
      .catch(() => {})
      .finally(() => setBusy(''))
  }

  const doTest = (id) => {
    setBusy(id)
    testDataSource(id)
      .then((r) => {
        const src = sources.find((x) => x.id === id)
        setTestMsg(`${src?.name}: ${r.message}`)
        setTimeout(() => setTestMsg(''), 4000)
      })
      .catch(() => {})
      .finally(() => setBusy(''))
  }

  return (
    <div className="dsrc-page">
      <header className="dsrc-topbar">
        <button type="button" className="dsrc-back" onClick={goBack}>
          ← {view === 'list' ? t('ds.backChat') : t('ds.backTo')}
        </button>
        <span className="dsrc-topbar-title">{title}</span>
        <span className="dsrc-topbar-badge">
          <DatabaseGlyph size={15} /> PostgreSQL
        </span>
      </header>

      <div className="dsrc-container">
        {testMsg && <div className="ds-bannertest">{testMsg}</div>}

        {view === 'list' && (
          <>
            <p className="dsrc-sub">{t('ds.sub')}</p>
            <DataSourceList
              sources={sources}
              activeId={activeId}
              busy={busy}
              loading={loading}
              onNew={openNew}
              onEdit={openEdit}
              onSetActive={doSetActive}
              onTest={doTest}
              onRemove={remove}
            />
          </>
        )}

        {view === 'new' && newStep === 'type' && (
          <TypeSelectStep onPick={() => setNewStep('form')} />
        )}

        {(view === 'new' && newStep === 'form') || view === 'edit' ? (
          <DataSourceForm
            editing={view === 'edit' ? editing : null}
            onSaved={handleSaved}
            onError={(m) => {
              if (!m) return
              setTestMsg(m)
              setTimeout(() => setTestMsg(''), 4000)
            }}
          />
        ) : null}
      </div>
    </div>
  )
}
