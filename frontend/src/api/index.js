import axios from 'axios'

// 统一的后端 API 客户端。开发环境经 vite proxy 转发到 FastAPI (http://127.0.0.1:8100)
const api = axios.create({
  baseURL: '/api',
  timeout: 180000,
})

// 自动带上登录 token，供后端识别用户（用于长期记忆按用户归档）
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('askdata_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 登录：payload = { email: string, password: string }
export function login(payload) {
  return api.post('/login', payload).then((res) => res.data)
}

// 向工具提问：payload = { question: string, session_id?: string }；signal 用于“停止”时取消
export function askQuestion(payload, signal) {
  return api.post('/ask', payload, { signal }).then((res) => res.data)
}

// 解析一行 SSE data 块
function parseSseData(text, handlers) {
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue
    const raw = line.slice(6).trim()
    if (!raw) continue
    const ev = JSON.parse(raw)
    if (ev.type === 'reasoning') handlers.onReasoning?.(ev.delta ?? '')
    else if (ev.type === 'text') handlers.onText?.(ev.delta ?? '')
    else if (ev.type === 'error') throw new Error(ev.error || 'unknown error')
    else if (ev.type === 'done') return ev
  }
  return null
}

// 流式提问（SSE）：逐块回调 thinking / text 增量，resolve with done 事件。
export async function askQuestionStream(payload, handlers = {}) {
  const { onReasoning, onText, signal } = handlers || {}
  const headers = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem('askdata_token')
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch('/api/ask/stream', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal,
  })
  if (!res.ok || !res.body) {
    let detail = `请求失败（${res.status}）`
    try {
      const j = await res.json()
      detail = j?.detail ?? detail
    } catch {}
    throw new Error(detail)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let doneEvent = null

  const handleData = (text) => {
    buffer += text
    let idx
    const content = []
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const ev = parseSseData(chunk, handlers)
      if (ev) { doneEvent = ev; return true }
    }
    return false
  }

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (handleData(decoder.decode(value, { stream: true }))) break
  }
  if (!doneEvent) handleData(decoder.decode())
  if (!doneEvent) throw new Error('连接中断，未收到完成事件')
  return doneEvent
}

// 会话历史（可选）
export function getSession() {
  return api.get('/session').then((res) => res.data)
}

// 读取某会话的历史消息（含模型历史回复），用于恢复对话
export function getHistory(sessionId) {
  return api.get('/ask/history', { params: { session_id: sessionId } }).then((res) => res.data)
}

// 枚举历史会话列表（标题=首条用户消息，按最近更新倒序）
export function getSessions() {
  return api.get('/ask/sessions').then((res) => res.data)
}

// 删除某个历史会话（连同它的所有历史消息）
export function deleteSession(sessionId) {
  return api.delete(`/ask/sessions/${encodeURIComponent(sessionId)}`).then((res) => res.data)
}

export default api
