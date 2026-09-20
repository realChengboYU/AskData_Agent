import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "askdata_lang";

export type Lang = "zh" | "en";

export const LANGS: Lang[] = ["zh", "en"];

export const LANG_LABELS: Record<Lang, string> = {
  zh: "简体中文",
  en: "English",
};

// 文案对照表：zh 为主，en 兜底每个 key 都给出原文。
const dict: Record<Lang, Record<string, string>> = {
  zh: {
    welcome: "让我们开始聊天吧",
    loadingConversation: "正在加载对话…",
    composerPlaceholder: "输入你的问题，例如：上月销售额前五的产品…",
    composerInputLabel: "消息输入框",
    composerSend: "发送消息",
    composerCancel: "停止生成",
    composerVoiceInput: "语音输入",
    composerStartVoice: "开始语音输入",
    composerStopVoice: "停止语音输入",
    composerStopDictation: "停止听写",
    copy: "复制",
    scrollToBottom: "滚动到底部",
    helpful: "有帮助",
    notHelpful: "没帮助",
    refresh: "刷新",
    more: "更多",
    exportMarkdown: "导出为 Markdown",
    edit: "编辑",
    previous: "上一个",
    next: "下一个",
    cancel: "取消",
    update: "更新",
    assistantWorking: "助手正在思考…",
    thinkingProcess: "思考过程",
    assistantSpeaking: "助手正在说话…",
    voiceConversation: "语音对话",
    youSaid: "你说",
    assistantSaid: "助手说",
    removeFile: "移除文件",
    addAttachment: "添加附件",
    imageZoom: "点击放大图片",
    imageZoomed: "已放大的图片",
    imageCloseZoom: "关闭放大图片",
    imageRegenerate: "重新生成图片",
    imageDownload: "下载图片",
    imageCopy: "复制图片",
    imageGenerating: "正在生成图片…",
    imageGenerateFailed: "图片生成失败",
    settings: "设置",
    language: "语言",
    logout: "退出",
    close: "关闭",
    newChat: "新建对话",
    sessions: "会话",
    noSessions: "暂无会话",
    toggleSidebar: "折叠 / 展开侧边栏",
    model: "模型",
  },
  en: {
    welcome: "Let's start chatting!",
    loadingConversation: "Loading conversation",
    composerPlaceholder: "Send a message...",
    composerInputLabel: "Message input",
    composerSend: "Send message",
    composerCancel: "Stop generating",
    composerVoiceInput: "Voice input",
    composerStartVoice: "Start voice input",
    composerStopVoice: "Stop voice input",
    composerStopDictation: "Stop dictation",
    copy: "Copy",
    scrollToBottom: "Scroll to bottom",
    helpful: "Helpful",
    notHelpful: "Not helpful",
    refresh: "Refresh",
    more: "More",
    exportMarkdown: "Export as Markdown",
    edit: "Edit",
    previous: "Previous",
    next: "Next",
    cancel: "Cancel",
    update: "Update",
    assistantWorking: "Assistant is working",
    thinkingProcess: "Reasoning",
    assistantSpeaking: "Assistant is speaking",
    voiceConversation: "Voice conversation",
    youSaid: "You said",
    assistantSaid: "Assistant said",
    removeFile: "Remove file",
    addAttachment: "Add Attachment",
    imageZoom: "Click to zoom image",
    imageZoomed: "Zoomed image",
    imageCloseZoom: "Close zoomed image",
    imageRegenerate: "Regenerate image",
    imageDownload: "Download image",
    imageCopy: "Copy image",
    imageGenerating: "Generating image…",
    imageGenerateFailed: "Image could not be generated",
    settings: "Settings",
    language: "Language",
    logout: "Log out",
    close: "Close",
    newChat: "New chat",
    sessions: "Sessions",
    noSessions: "No conversations yet",
    toggleSidebar: "Toggle sidebar",
    model: "Model",
  },
};

type I18nValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nValue | undefined>(undefined);

function readStoredLang(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "zh";
  } catch {
    return "zh";
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore storage errors (e.g. private mode)
    }
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    if (next === "zh" || next === "en") setLangState(next);
  }, []);

  const t = useCallback(
    (key: string) => dict[lang][key] ?? dict.en[key] ?? key,
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  // 兜底：Provider 之外使用时返回默认（简体中文），setLang 为空操作。
  const fallbackT = (key: string) => dict.zh[key] ?? dict.en[key] ?? key;
  return { lang: "zh", setLang: () => {}, t: fallbackT };
}
