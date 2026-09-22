import { createContext, useContext } from 'react'

// 让 PromptBar 能触发对话发送（走 assistant-ui runtime）与“停止”当前请求，
// 并通过 composerRef 对外暴露“设置输入文本 + 聚焦”（用于「引用某条回答追问」）。
export const ComposerControlsContext = createContext({
  onStop: undefined,
  send: undefined,
  composerRef: undefined,
})

export function useComposerControls() {
  return useContext(ComposerControlsContext)
}
