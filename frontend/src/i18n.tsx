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
    quote: "引用追问",
    retry: "重试",
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
    "ds.title": "数据源",
    "ds.sub": "连接 PostgreSQL 数据库，供智能体查询",
    "ds.close": "关闭",
    "ds.backTo": "返回列表",
    "ds.new": "新建数据源",
    "ds.edit": "编辑数据源",
    "ds.searchDs": "搜索数据源",
    "ds.viewTables": "查看表",
    "ds.noMatch": "没有匹配的数据源",
    "ds.name": "名称",
    "ds.host": "地址",
    "ds.port": "端口",
    "ds.database": "数据库",
    "ds.username": "用户名",
    "ds.password": "密码",
    "ds.passwordKeep": "留空保持不变",
    "ds.passwordKeepHint": "留空则保持原有密码不变",
    "ds.connString": "连接串",
    "ds.test": "测试连接",
    "ds.save": "保存",
    "ds.yours": "{n} 个数据源",
    "ds.emptyTitle": "还没有数据源",
    "ds.emptySub": "添加一个 PostgreSQL 连接，就能开始向数据库提问",
    "ds.active": "使用中",
    "ds.setActive": "设为使用中",
    "ds.delete": "删除",
    "ds.confirmDelete": "确定删除数据源「{name}」？此操作不可撤销",
    "ds.backChat": "返回对话",
    "ds.prev": "上一步",
    "ds.configure": "配置连接",
    "ds.chooseType": "选择数据库类型",
    "ds.chooseTypeSub": "目前支持 PostgreSQL，更多类型即将上线。",
    "ds.continue": "继续",
    "ds.available": "已支持",
    "ds.comingSoon": "即将支持",
    "ds.relation": "关系型数据库",
    "ds.embedded": "嵌入式数据库",
    "ds.testFail": "测试失败",
    "ds.saveFail": "保存失败",
    "ds.next": "下一步",
    "ds.nextHint": "将先测试连接并创建数据源，再选择要使用的表",
    "ds.chooseTables": "选择表",
    "ds.chooseTablesSub": "勾选要暴露给问数的表，可补充业务注释，大模型将基于这些表回答问题",
    "ds.searchTables": "搜索表名",
    "ds.selectAll": "全选",
    "ds.selectedCount": "已选 {n} / {total}",
    "ds.nTables": "{n} 张表",
    "ds.tablesShort": "张表",
    "ds.ovSources": "数据源",
    "ds.ovTables": "已选表",
    "ds.ovNone": "未设置",
    "ds.schema": "Schema",
    "ds.schemaHint": "默认 public；点「获取」可列出库内 schema 供选择",
    "ds.fetchSchemas": "获取",
    "ds.fetching": "获取中…",
    "ds.schemasNone": "未获取到 schema",
    "ds.advanced": "高级选项",
    "ds.timeout": "连接超时（秒）",
    "ds.poolSize": "连接池大小",
    "ds.ssl": "启用 SSL",
    "ds.fields": "字段",
    "ds.fieldName": "字段",
    "ds.fieldType": "类型",
    "ds.fieldComment": "注释",
    "ds.fieldEnum": "枚举值",
    "ds.fieldCommentPh": "补充字段含义",
    "ds.fieldEnumPh": "逗号分隔，如 启用,停用",
    "ds.fieldChecked": "已选字段 {n}/{total}",
    "ds.tableComment": "表注释",
    "ds.customComment": "自定义注释",
    "ds.customCommentPh": "补充这张表的业务含义，帮助大模型理解",
    "ds.preview": "预览数据",
    "ds.previewEmpty": "（无数据）",
    "ds.noActiveTable": "从左侧选一个表，查看字段与数据预览",
    "ds.tablesEmpty": "该库 public 下没有表",
    "ds.tablesLoading": "正在读取表…",
    "ds.cancel": "取消",
    "ds.tablesReadFail": "读取表失败",
    "nav.kb": "知识库",
    "nav.window": "新建窗口",
    "nav.search": "搜索",
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
    quote: "Quote & ask",
    retry: "Retry",
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
    "ds.title": "Data sources",
    "ds.sub": "Connect a PostgreSQL database for the assistant to query",
    "ds.close": "Close",
    "ds.backTo": "Back",
    "ds.new": "New data source",
    "ds.edit": "Edit data source",
    "ds.searchDs": "Search data sources",
    "ds.viewTables": "View tables",
    "ds.noMatch": "No matching data sources",
    "ds.name": "Name",
    "ds.host": "Host",
    "ds.port": "Port",
    "ds.database": "Database",
    "ds.username": "Username",
    "ds.password": "Password",
    "ds.passwordKeep": "Leave empty to keep",
    "ds.passwordKeepHint": "Leave empty to keep the current password",
    "ds.connString": "Connection string",
    "ds.test": "Test connection",
    "ds.save": "Save",
    "ds.yours": "{n} data sources",
    "ds.emptyTitle": "No data sources yet",
    "ds.emptySub": "Add a PostgreSQL connection to start asking your database",
    "ds.active": "In use",
    "ds.setActive": "Set active",
    "ds.delete": "Delete",
    "ds.confirmDelete": "Delete data source \"{name}\"? This can't be undone.",
    "ds.backChat": "Back to chat",
    "ds.prev": "Previous step",
    "ds.configure": "Configure connection",
    "ds.chooseType": "Choose a database type",
    "ds.chooseTypeSub": "PostgreSQL is available now; more types are coming.",
    "ds.continue": "Continue",
    "ds.available": "Available",
    "ds.comingSoon": "Coming soon",
    "ds.relation": "Relational database",
    "ds.embedded": "Embedded database",
    "ds.testFail": "Test failed",
    "ds.saveFail": "Save failed",
    "ds.next": "Next",
    "ds.nextHint": "Tests the connection and creates the source, then you pick the tables to use",
    "ds.chooseTables": "Choose tables",
    "ds.chooseTablesSub": "Select the tables to expose for Q&A and add business notes; the model answers from these tables",
    "ds.searchTables": "Search tables",
    "ds.selectAll": "Select all",
    "ds.selectedCount": "{n} / {total} selected",
    "ds.nTables": "{n} tables",
    "ds.tablesShort": "tables",
    "ds.ovSources": "Data sources",
    "ds.ovTables": "Tables selected",
    "ds.ovNone": "None yet",
    "ds.schema": "Schema",
    "ds.schemaHint": "Defaults to public; click Fetch to list schemas in this database",
    "ds.fetchSchemas": "Fetch",
    "ds.fetching": "Fetching…",
    "ds.schemasNone": "No schemas found",
    "ds.advanced": "Advanced options",
    "ds.timeout": "Timeout (s)",
    "ds.poolSize": "Pool size",
    "ds.ssl": "Enable SSL",
    "ds.fields": "Fields",
    "ds.fieldName": "Field",
    "ds.fieldType": "Type",
    "ds.fieldComment": "Note",
    "ds.fieldEnum": "Enum values",
    "ds.fieldCommentPh": "What this field means",
    "ds.fieldEnumPh": "Comma-separated, e.g. on,off",
    "ds.fieldChecked": "Fields {n}/{total}",
    "ds.tableComment": "Table comment",
    "ds.customComment": "Custom note",
    "ds.customCommentPh": "Add what this table means, to help the model understand it",
    "ds.preview": "Preview data",
    "ds.previewEmpty": "(no data)",
    "ds.noActiveTable": "Pick a table on the left to view its fields and a data preview",
    "ds.tablesEmpty": "No tables under public in this database",
    "ds.tablesLoading": "Loading tables…",
    "ds.cancel": "Cancel",
    "ds.tablesReadFail": "Failed to read tables",
    "nav.kb": "Knowledge base",
    "nav.window": "New window",
    "nav.search": "Search",
  },
};

type I18nValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
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
    (key: string, vars?: Record<string, string | number>) => {
      let str = dict[lang][key] ?? dict.en[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, String(v));
      return str;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  // 兜底：Provider 之外使用时返回默认（简体中文），setLang 为空操作。
  const fallbackT = (key: string, vars?: Record<string, string | number>) => {
    let str = dict.zh[key] ?? dict.en[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) str = str.replace(`{${k}}`, String(v));
    return str;
  };
  return { lang: "zh", setLang: () => {}, t: fallbackT };
}
