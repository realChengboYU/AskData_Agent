import { ConfigProvider } from 'antd'
import { Routes, Route, Navigate } from 'react-router-dom'
import { antdTheme } from './theme'
import Login from './pages/Login'
import Chat from './pages/Chat'

export default function App() {
  return (
    <ConfigProvider theme={antdTheme}>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/chat" element={<Chat />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </ConfigProvider>
  )
}
