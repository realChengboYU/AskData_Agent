import { useCallback, useEffect, useRef, useState } from 'react'
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
import { useI18n } from '../../i18n'
import {
  createDataSource,
  deleteDataSource,
  getDataSources,
  setDataSourceActive,
  testDataSource,
  testDataSourceRaw,
  updateDataSource,
} from '../../api'
import './datasource.css'

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

// 新建 / 编辑表单（抽屉内切换到该视图）
function DataSourceForm({ editing, onBack, onSaved, onError }) {
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
  const [testResult, setTestResult] = useState(null) // {ok, message}

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
      setTestResult({ ok: false, message: e?.response?.data?.detail || '测试失败' })
    } finally {
      setTesting(false)
    }
  }

  async function save() {
    if (!canSave || saving) return
    setSaving(true)
    onError?.('')
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
      onError?.(e?.response?.data?.detail || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="ds-form">
      <div className="ds-form-head">
        <button type="button" className="ds-back" onClick={onBack}>
          ← {t('ds.backTo')}
        </button>
        <h3 className="ds-form-title">{isEdit ? t('ds.edit') : t('ds.new')}</h3>
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
        {isEdit && !form.password && (
          <span className="ds-hint">{t('ds.passwordKeepHint')}</span>
        )}
      </div>

      {/* 连接串预览——随输入实时拼出（密码打码） */}
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
        <button
          type="button"
          className="ds-btn ds-btn-primary"
          disabled={!canSave || saving}
          onClick={save}
        >
          {saving ? <LoadingOutlined spin /> : null}
          {t('ds.save')}
        </button>
      </div>
    </div>
  )
}

// 数据源列表（抽屉默认视图）
function DataSourceList({ sources, activeId, busy, loading, onNew, onEdit, onSetActive, onTest, onRemove }) {
  const { t } = useI18n()
  if (!loading && sources.length === 0) {
    return (
      <div className="ds-empty">
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
      <div className="ds-list">
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
                  <button
                    type="button"
                    className="ds-act ds-act-del"
                    onClick={() => onRemove(s)}
                    title={t('ds.delete')}
                  >
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

// 一个小的数据库图形（列表空态用）
function DatabaseGlyph() {
  return (
    <svg viewBox="0 0 48 48" width="44" height="44" fill="none" aria-hidden="true">
      <ellipse cx="24" cy="12" rx="15" ry="6" stroke="currentColor" strokeWidth="2.4" />
      <path d="M9 12v24c0 3.3 6.7 6 15 6s15-2.7 15-6V12" stroke="currentColor" strokeWidth="2.4" />
      <path d="M9 24c0 3.3 6.7 6 15 6s15-2.7 15-6" stroke="currentColor" strokeWidth="2.4" opacity="0.55" />
    </svg>
  )
}

export default function DataSourceDrawer({ open, onClose }) {
  const { t } = useI18n()
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState('list') // 'list' | 'form'
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
    if (open) {
      setView('list')
      load()
    }
  }, [open, load])

  // ESC 关闭
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const openNew = () => {
    setEditing(null)
    setTestMsg('')
    setView('form')
  }
  const openEdit = (s) => {
    setEditing(s)
    setTestMsg('')
    setView('form')
  }

  const handleSaved = (newId) => {
    // 首次创建（此前无任何「使用中」数据源）时自动激活，省去一步
    const shouldAutoActivate = !!newId && !hadActiveRef.current
    setView('list')
    setEditing(null)
    load()
    if (shouldAutoActivate) {
      setDataSourceActive(newId).catch(() => {})
    }
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
        setTestMsg(r.ok ? `${src?.name}: ${r.message}` : `${src?.name}: ${r.message}`)
        // 成功/失败都短暂提示后清除
        setTimeout(() => setTestMsg(''), 4000)
      })
      .catch(() => {})
      .finally(() => setBusy(''))
  }

  return (
    <>
      <div className={`ds-overlay${open ? ' open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`ds-drawer${open ? ' open' : ''}`} aria-hidden={!open} role="dialog" aria-label={t('ds.title')}>
        <header className="ds-drawer-head">
          <div className="ds-drawer-title">
            <h2>{t('ds.title')}</h2>
            <span className="ds-pg-badge">
              <DatabaseGlyph /> PostgreSQL
            </span>
          </div>
          <button type="button" className="ds-close" onClick={onClose} aria-label={t('ds.close')}>
            <CloseOutlined />
          </button>
        </header>

        <p className="ds-drawer-sub">{t('ds.sub')}</p>

        {testMsg && <div className="ds-bannertest">{testMsg}</div>}

        <div className="ds-drawer-body">
          {view === 'list' ? (
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
          ) : (
            <DataSourceForm
              editing={editing}
              onBack={() => setView('list')}
              onSaved={handleSaved}
              onError={(m) => {
                if (!m) return
                setTestMsg(m)
                setTimeout(() => setTestMsg(''), 4000)
              }}
            />
          )}
        </div>
      </aside>
    </>
  )
}
