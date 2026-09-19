import axios from 'axios'

// 统一的后端 API 客户端。开发环境经 vite proxy 转发到 FastAPI (http://127.0.0.1:8000)
const api = axios.create({
  baseURL: '/api',
  timeout: 180000,
})

// 向工具提问：payload = { question: string, session_id?: string }
export function askQuestion(payload) {
  return api.post('/ask', payload).then((res) => res.data)
}

// 会话历史（可选）
export function getSession() {
  return api.get('/session').then((res) => res.data)
}

export default api
