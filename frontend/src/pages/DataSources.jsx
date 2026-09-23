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
  SearchOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { useI18n } from '../i18n'
import {
  createDataSource,
  deleteDataSource,
  getDataSources,
  introspectFields,
  introspectPreview,
  introspectTables,
  saveCuratedTables,
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

const EMPTY = { name: '', host: '', port: 5432, dbname: '', username: '', password: '', description: '' }

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

// 第 2 步：配置连接（新建 / 编辑）——「下一步」先测试连通，再创建/更新数据源并进入选表步
function DataSourceForm({ editing, existingId, onNext, onPrev, onError }) {
  const { t } = useI18n()
  const isEdit = !!editing
  const targetId = isEdit ? editing.id : existingId
  const [form, setForm] = useState(() =>
    isEdit
      ? {
          name: editing.name || '',
          host: editing.host || '',
          port: editing.port || 5432,
          dbname: editing.dbname || '',
          username: editing.username || '',
          password: '',
          description: editing.description || '',
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

  // 下一步：先测试连通（gating），通过后创建/更新数据源并进入选表步
  async function next() {
    if (!canSave || saving) return
    setSaving(true)
    setTestResult(null)
    try {
      const tr = await testDataSourceRaw({
        host: form.host.trim(),
        port: Number(form.port) || 5432,
        dbname: form.dbname.trim(),
        username: form.username.trim(),
        password: form.password,
      })
      if (!tr?.ok) {
        setTestResult(tr || { ok: false, message: t('ds.testFail') })
        return
      }
      const payload = {
        name: form.name.trim(),
        host: form.host.trim(),
        port: Number(form.port) || 5432,
        dbname: form.dbname.trim(),
        username: form.username.trim(),
        description: form.description || '',
      }
      if (targetId) {
        if (form.password) payload.password = form.password
        await updateDataSource(targetId, payload)
        onNext(targetId, false)
      } else {
        payload.password = form.password || ''
        const r = await createDataSource(payload)
        onNext(r?.id, true)
      }
    } catch (e) {
      const detail = e?.response?.data?.detail
      setTestResult({ ok: false, message: detail || t('ds.saveFail') })
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
        {!isEdit && (
          <button type="button" className="ds-btn ds-btn-ghost" disabled={saving} onClick={onPrev}>
            ← {t('ds.prev')}
          </button>
        )}
        <button
          type="button"
          className="ds-btn ds-btn-ghost"
          disabled={!canSave || testing || saving}
          onClick={doTest}
        >
          {testing ? <LoadingOutlined spin /> : <ThunderboltOutlined />}
          {t('ds.test')}
        </button>
        <button type="button" className="ds-btn ds-btn-primary" disabled={!canSave || saving} onClick={next}>
          {saving ? <LoadingOutlined spin /> : null}
          {t('ds.next')} →
        </button>
      </div>
    </div>
  )
}

// 第 3 步：选择表（左表清单 + 右字段/注释/预览）
function TableSelectStep({ sourceId, onSaved, onCancel, onPrev, onError }) {
  const { t } = useI18n()
  const [tables, setTables] = useState([]) // [{table_name, table_comment, custom_comment, checked}]
  const [loading, setLoading] = useState(true)
  const [loadErr, setLoadErr] = useState('')
  const [search, setSearch] = useState('')
  const [active, setActive] = useState('')
  const [fields, setFields] = useState([])
  const [fieldsLoading, setFieldsLoading] = useState(false)
  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // 载入目标库的表
  useEffect(() => {
    let live = true
    setLoading(true)
    setLoadErr('')
    setTables([])
    setActive('')
    setPreview(null)
    setFields([])
    introspectTables(sourceId)
      .then((d) => {
        if (!live) return
        const list = (d?.tables ?? []).map((x) => ({
          table_name: x.table_name,
          table_comment: x.table_comment || '',
          custom_comment: '',
          checked: true,
        }))
        setTables(list)
        if (list.length) setActive(list[0].table_name)
      })
      .catch((e) => {
        if (live) setLoadErr(e?.response?.data?.detail || t('ds.tablesReadFail'))
      })
      .finally(() => live && setLoading(false))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId])

  // 切换到某张表 → 载入其字段
  useEffect(() => {
    if (!active) return
    let live = true
    setFieldsLoading(true)
    setFields([])
    setPreview(null)
    introspectFields(sourceId, active)
      .then((d) => live && setFields(d?.fields ?? []))
      .catch(() => {})
      .finally(() => live && setFieldsLoading(false))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, sourceId])

  const kw = search.trim().toLowerCase()
  const filtered = kw ? tables.filter((x) => x.table_name.toLowerCase().includes(kw)) : tables
  const checkedCount = tables.filter((x) => x.checked).length
  const allChecked = tables.length > 0 && checkedCount === tables.length
  const activeRow = tables.find((x) => x.table_name === active)

  const setChecked = (name, val) => setTables((ts) => ts.map((x) => (x.table_name === name ? { ...x, checked: val } : x)))
  const setComment = (name, val) => setTables((ts) => ts.map((x) => (x.table_name === name ? { ...x, custom_comment: val } : x)))
  const setAll = (val) => setTables((ts) => ts.map((x) => ({ ...x, checked: val })))

  async function doPreview() {
    if (!active || previewLoading) return
    setPreviewLoading(true)
    setPreview(null)
    try {
      setPreview(await introspectPreview(sourceId, active, 10))
    } catch (e) {
      onError?.(e?.response?.data?.detail || t('ds.tablesReadFail'))
    } finally {
      setPreviewLoading(false)
    }
  }

  async function save() {
    if (saving || !tables.length) return
    setSaving(true)
    try {
      await saveCuratedTables(sourceId, tables)
      onSaved()
    } catch (e) {
      onError?.(e?.response?.data?.detail || t('ds.saveFail'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dsrc-flow dsrc-flow-tables">
      <div className="dsrc-flow-head">
        <h3 className="dsrc-flow-title">
          {t('ds.chooseTables')} <span className="dsrc-flow-badge">PostgreSQL</span>
        </h3>
        <p className="dsrc-flow-sub">{t('ds.chooseTablesSub')}</p>
      </div>

      {loadErr ? (
        <div className="ds-test err" role="alert">
          <CloseOutlined />
          <span>{loadErr}</span>
        </div>
      ) : (
        <div className="dsrc-tables">
          {/* 左：表清单 */}
          <div className="dsrc-tables-left">
            <div className="dsrc-tables-tools">
              <label className="dsrc-tables-search">
                <SearchOutlined />
                <input value={search} placeholder={t('ds.searchTables')} onChange={(e) => setSearch(e.target.value)} />
              </label>
              <label className="dsrc-tables-all">
                <input type="checkbox" checked={allChecked} onChange={(e) => setAll(e.target.checked)} />
                {t('ds.selectAll')}
              </label>
            </div>
            <div className="dsrc-tables-count">
              {t('ds.selectedCount', { n: checkedCount, total: tables.length })}
            </div>
            {loading ? (
              <div className="dsrc-tables-state">
                <LoadingOutlined spin /> {t('ds.tablesLoading')}
              </div>
            ) : filtered.length === 0 ? (
              <div className="dsrc-tables-state">{t('ds.tablesEmpty')}</div>
            ) : (
              <ul className="dsrc-tables-list">
                {filtered.map((x) => (
                  <li
                    key={x.table_name}
                    className={`dsrc-table${active === x.table_name ? ' active' : ''}`}
                    onClick={() => setActive(x.table_name)}
                  >
                    <input
                      type="checkbox"
                      checked={x.checked}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => setChecked(x.table_name, e.target.checked)}
                      aria-label={x.table_name}
                    />
                    <span className="dsrc-table-name">{x.table_name}</span>
                    {x.custom_comment && <span className="dsrc-table-note" aria-hidden="true">✎</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 右：字段 / 注释 / 预览 */}
          <div className="dsrc-tables-right">
            {!active ? (
              <div className="dsrc-tables-state">{t('ds.noActiveTable')}</div>
            ) : (
              <>
                <div className="dsrc-ds-name">
                  <code className="ds-conn-code-inline">{active}</code>
                  {activeRow?.table_comment && (
                    <span className="dsrc-ds-comment" title={t('ds.tableComment')}>
                      {activeRow.table_comment}
                    </span>
                  )}
                </div>

                <div className="ds-field">
                  <label htmlFor="ds-custom-comment">{t('ds.customComment')}</label>
                  <textarea
                    id="ds-custom-comment"
                    className="ds-input ds-input-area"
                    rows={2}
                    value={activeRow?.custom_comment || ''}
                    placeholder={t('ds.customCommentPh')}
                    onChange={(e) => setComment(active, e.target.value)}
                  />
                </div>

                <div className="dsrc-fields">
                  <div className="dsrc-fields-head">
                    <span className="dsrc-fields-title">{t('ds.fields')}</span>
                    <button
                      type="button"
                      className="ds-btn ds-btn-ghost ds-btn-sm"
                      disabled={previewLoading}
                      onClick={doPreview}
                    >
                      {previewLoading ? <LoadingOutlined spin /> : <EyeOutlined />} {t('ds.preview')}
                    </button>
                  </div>
                  {preview && preview.columns.length ? (
                    <div className="dsrc-preview">
                      <table className="dsrc-preview-table">
                        <thead>
                          <tr>
                            {preview.columns.map((c) => (
                              <th key={c}>{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {preview.rows.map((r, i) => (
                            <tr key={i}>
                              {r.map((v, j) => (
                                <td key={j}>{v == null ? '' : String(v)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {preview.rows.length === 0 && <div className="dsrc-tables-state">{t('ds.previewEmpty')}</div>}
                    </div>
                  ) : fieldsLoading ? (
                    <div className="dsrc-tables-state">
                      <LoadingOutlined spin />
                    </div>
                  ) : (
                    <ul className="dsrc-fields-list">
                      {fields.map((f) => (
                        <li key={f.field_name}>
                          <code className="dsrc-field-name">{f.field_name}</code>
                          <span className="dsrc-field-type">{f.field_type}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div className="ds-form-actions">
        <button type="button" className="ds-btn ds-btn-ghost" disabled={saving} onClick={onPrev}>
          ← {t('ds.prev')}
        </button>
        <button type="button" className="ds-btn ds-btn-ghost" disabled={saving} onClick={onCancel}>
          {t('ds.cancel')}
        </button>
        <button
          type="button"
          className="ds-btn ds-btn-primary"
          disabled={loading || saving || !tables.length}
          onClick={save}
        >
          {saving ? <LoadingOutlined spin /> : <CheckCircleFilled />} {t('ds.save')}
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
                  <span className="ds-item-name-row">
                    <span className="ds-item-name">{s.name}</span>
                    {typeof s.num === 'number' && s.num > 0 && (
                      <span className="ds-item-count">{t('ds.nTables', { n: s.num })}</span>
                    )}
                  </span>
                  <span className="ds-item-sub">{s.username}@{s.host}:{s.port} / {s.dbname}</span>
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

export default function DataSources({ onBackToChat }) {
  const { t } = useI18n()
  const [sources, setSources] = useState([])
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState('list') // 'list' | 'new' | 'edit'
  const [newStep, setNewStep] = useState('type') // 'type' | 'form' | 'tables'
  const [editing, setEditing] = useState(null)
  const [currentId, setCurrentId] = useState(null) // 当前向导流程中的数据源 id
  const [freshCreated, setFreshCreated] = useState(false) // 「下一步」刚建、还没保存表的源（取消时删）
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

  // ESC：向导内回退一级；列表则回到对话。用 ref 保证始终调用最新的 goBack
  const goBackRef = useRef(() => {})
  useEffect(() => {
    goBackRef.current = goBack
  })
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && goBackRef.current()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // 退出向导回到列表；keep=false 时删除「下一步」刚建但还没保存表的悬空源
  const goToList = ({ keep = false } = {}) => {
    if (freshCreated && !keep && currentId) deleteDataSource(currentId).catch(() => {})
    setView('list')
    setNewStep('type')
    setEditing(null)
    setCurrentId(null)
    setFreshCreated(false)
    load()
  }

  const goBack = () => {
    if (view === 'list') return onBackToChat?.()
    if (view === 'edit') {
      if (newStep === 'form') return goToList()
      if (newStep === 'tables') return setNewStep('form')
      return
    }
    // view === 'new'
    if (newStep === 'type') return goToList()
    if (newStep === 'form') return setNewStep('type')
    if (newStep === 'tables') return setNewStep('form')
  }

  const title =
    view === 'edit' ? t('ds.edit') : view === 'new' ? t('ds.new') : t('ds.title')

  const openNew = () => {
    setEditing(null)
    setCurrentId(null)
    setFreshCreated(false)
    setTestMsg('')
    setNewStep('type')
    setView('new')
  }
  const openEdit = (s) => {
    setEditing(s)
    setCurrentId(s.id)
    setFreshCreated(false)
    setTestMsg('')
    setNewStep('form')
    setView('edit')
  }

  // 表单「下一步」成功（已测试连通 + 已创建/更新源）→ 进入选表步
  const handleFormNext = (id, created) => {
    if (!id) return
    setCurrentId(id)
    setFreshCreated(!!created)
    setNewStep('tables')
  }

  // 选表步「保存」成功 → 回列表（保留源）；首个源自动设为使用中
  const handleTablesSaved = () => {
    const cid = currentId
    goToList({ keep: true })
    if (cid && !hadActiveRef.current) setDataSourceActive(cid).catch(() => {})
  }

  // 选表步「取消」→ 回列表（删除未保存的悬空源）
  const handleTablesCancel = () => goToList()

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

  const backToLabel =
    (view === 'new' && newStep === 'type') || (view === 'edit' && newStep === 'form')
      ? t('ds.backTo')
      : t('ds.prev')

  return (
    <div className="dsrc-page">
      <header className="dsrc-topbar">
        {/* 列表视图不显示返回按钮（返回对话走侧边栏「返回对话」）；向导步保留，用于页内返回 */}
        {view !== 'list' && (
          <button type="button" className="dsrc-back" onClick={goBack}>
            ← {backToLabel}
          </button>
        )}
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

        {view === 'new' && newStep === 'type' && <TypeSelectStep onPick={() => setNewStep('form')} />}

        {/* 表单 & 选表：进入流程后保持挂载、仅隐藏切换，回退再前进不丢已填内容 */}
        {(view === 'new' || view === 'edit') && (
          <div style={{ display: newStep === 'form' ? 'block' : 'none' }}>
            <DataSourceForm
              editing={view === 'edit' ? editing : null}
              existingId={view === 'new' ? currentId : null}
              onNext={handleFormNext}
              onPrev={() => setNewStep('type')}
              onError={(m) => {
                if (!m) return
                setTestMsg(m)
                setTimeout(() => setTestMsg(''), 4000)
              }}
            />
          </div>
        )}

        {(view === 'new' || view === 'edit') && currentId && (
          <div style={{ display: newStep === 'tables' ? 'block' : 'none' }}>
            <TableSelectStep
              sourceId={currentId}
              onSaved={handleTablesSaved}
              onCancel={handleTablesCancel}
              onPrev={() => setNewStep('form')}
              onError={(m) => {
                if (!m) return
                setTestMsg(m)
                setTimeout(() => setTestMsg(''), 4000)
              }}
            />
          </div>
        )}
      </div>
    </div>
  )
}
