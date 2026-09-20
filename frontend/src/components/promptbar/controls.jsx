import { createContext, useContext } from 'react'

// 让 PromptBar 能触发对话发送（走 assistant-ui runtime）与“停止”当前请求
export const ComposerControlsContext = createContext({ onStop: undefined, send: undefined })

export function useComposerControls() {
  return useContext(ComposerControlsContext)
}
