import axios from 'axios'

// 统一的后端 API 客户端。开发环境经 vite proxy 转发到 FastAPI (http://127.0.0.1:8100)
const api = axios.create({
  baseURL: '/api',
  timeout: 180000,
})

// 对瞬时故障（后端 --reload 重启窗口 / 网络抖动）做退避重试，避免首屏加载报 502。
async function retry(fn, { retries = 3, delay = 600 } = {}) {
  let lastErr
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      const status = e?.response?.status
      const retriable = !status || [502, 503, 504].includes(status)
      if (!retriable || i === retries) throw e
      await new Promise((r) => setTimeout(r, delay * (i + 1)))
    }
  }
  throw lastErr
}

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

// 读取某会话的历史消息（含模型历史回复），用于恢复对话
export function getHistory(sessionId) {
  return retry(() => api.get('/ask/history', { params: { session_id: sessionId } }).then((res) => res.data))
}

// 枚举历史会话列表（标题=首条用户消息，按最近更新倒序）
export function getSessions() {
  return retry(() => api.get('/ask/sessions').then((res) => res.data))
}

// 删除某个历史会话（连同它的所有历史消息）
export function deleteSession(sessionId) {
  return api.delete(`/ask/sessions/${encodeURIComponent(sessionId)}`).then((res) => res.data)
}

// 重命名某个会话（自定义标题；空标题回退为首条用户消息）
export function renameSession(sessionId, title) {
  return api
    .patch(`/ask/sessions/${encodeURIComponent(sessionId)}`, { title })
    .then((res) => res.data)
}

// 导出某会话为 Markdown 文件（返回 Blob）
export function exportSession(sessionId) {
  return api
    .get(`/ask/sessions/${encodeURIComponent(sessionId)}/export`, { responseType: 'blob' })
    .then((res) => res.data)
}

export default api
