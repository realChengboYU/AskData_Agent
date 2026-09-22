import { useAuiState } from '@assistant-ui/react';
import { useCallback } from 'react';
import {
  Calendar03Icon,
  ChartLineData01Icon,
  File02Icon,
  Globe02Icon,
  Mail01Icon,
} from '@hugeicons/core-free-icons';
import PromptBar from './PromptBar';
import { useComposerControls } from './controls';

// 平台主题色（DeepData 蓝调）
const THEME = {
  background: '#eff6ff', // 浅蓝雾面（输入框表面）
  color: '#1e3a8a', // 深蓝墨水（文字/图标）
  menuBackground: '#ffffff', // 下拉菜单表面
  sparkColor: '#2563eb', // 主色蓝（火花/高亮/滑杆）
};

// 数据问答平台菜单项（不含附件 attach，避免死按钮）
const SOURCES = [
  { key: 'web', name: 'Web search', description: 'Live results', icon: Globe02Icon },
  { key: 'sales', name: 'Sales data', description: 'Revenue and churn', icon: ChartLineData01Icon },
  { key: 'docs', name: 'Documents', description: 'Specs, notes, briefs', icon: File02Icon },
  { key: 'mail', name: 'Mail', description: 'Read and draft mail', icon: Mail01Icon },
  { key: 'calendar', name: 'Calendar', description: 'Events and availability', icon: Calendar03Icon },
];

const COMMANDS = [
  { key: 'summarize', name: '/summarize', description: 'Digest the thread so far' },
  { key: 'compare', name: '/compare', description: 'Two options side by side' },
  { key: 'draft', name: '/draft', description: 'Write a first version' },
  { key: 'explain', name: '/explain', description: 'A plain-language walkthrough' },
  { key: 'tasks', name: '/tasks', description: 'Turn this into a to-do list' },
];

// 模型选择器：显示并可在输入栏切换（当前后端为单模型，选择结果会随提问一起发送）
const MODELS = [
  { key: 'deepseek', name: 'DeepSeek', tag: '默认' },
  { key: 'nova-mini', name: 'Nova Mini', tag: 'Fast' },
  { key: 'nova-2', name: 'Nova 2', tag: 'Legacy' },
];

export function PromptBarComposer() {
  const { onStop, send, composerRef } = useComposerControls();
  // 是否正在生成回复：驱动「发送 → 停止」的箭头变形
  const busy = useAuiState((s) => s.thread.isRunning);

  const handleSend = useCallback(
    (text, _opts) => {
      const t = (text || '').trim();
      if (!t) return;
      // 走 Chat 里 assistant-ui 外部 store 的 onNew 流程（含会话隔离 + 流式输出）
      send?.({ role: 'user', content: t });
    },
    [send],
  );

  return (
    <div className="prompt-bar-composer">
      <PromptBar
        placeholder="有问题随时问我…"
        sources={SOURCES}
        commands={COMMANDS}
        models={MODELS}
        efforts={[]}
        busy={busy}
        onSend={handleSend}
        onStop={onStop}
        composerRef={composerRef}
        background={THEME.background}
        color={THEME.color}
        menuBackground={THEME.menuBackground}
        sparkColor={THEME.sparkColor}
        width={704}
        radius={16}
        maxRows={5}
      />
    </div>
  );
}

export default PromptBarComposer;
