"use client";

import { useState } from "react";
import { ChevronDownIcon, TerminalIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

/**
 * 工具调用信息块：复用「思考过程」的折叠样式（蓝边框 / 浅蓝底 / 蓝色触发字）。
 * 展示：调用工具名、参数、结果。用于展示智能体调用 SQL 等工具的过程。
 *
 * running（result 尚未返回）时显示加载指示 + 阶段文案（“正在查询数据库…/正在生成图表…”），
 * 让等待可见、不再像卡死。
 */
export function ToolCallBlock({
  name,
  args,
  result,
}: {
  name?: string;
  args?: unknown;
  result?: string;
}) {
  const [open, setOpen] = useState(false);
  const argsText = args == null ? "" : JSON.stringify(args, null, 2);
  const running = result == null;
  const isChart = name === "render_chart";
  const runningLabel = isChart ? "正在生成图表…" : "正在查询数据库…";

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      data-slot="tool-call-root"
      className="aui-tool-call-root mb-4 w-full rounded-lg border border-[#bfdbfe] bg-[#eff6ff] px-3 py-2"
    >
      <CollapsibleTrigger
        data-slot="tool-call-trigger"
        className="flex max-w-[75%] items-center gap-2 py-1.5 text-sm text-[#2563eb] transition-[color,scale] hover:text-[#1e3a8a] active:scale-[0.98]"
      >
        <TerminalIcon data-slot="tool-call-icon" className="size-4 shrink-0" />
        <span className="inline-block truncate leading-none">调用工具：{name}</span>
        {running && (
          <span
            data-slot="tool-call-running"
            className="inline-flex shrink-0 items-center gap-1 text-xs text-[#2563eb]/70"
          >
            <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-[#2563eb]/25 border-t-[#2563eb]" />
            {runningLabel}
          </span>
        )}
        <ChevronDownIcon
          data-slot="tool-call-chevron"
          className={cn(
            "mt-0.5 size-4 shrink-0 transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
            "-rotate-90",
            open && "rotate-0",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent
        data-slot="tool-call-content"
        className="relative overflow-hidden text-sm text-[#1e3a8a] outline-none"
      >
        <div className="ps-6 pt-2 pb-2 leading-relaxed">
          {argsText && (
            <>
              <div className="text-xs opacity-70">参数</div>
              <pre className="mb-2 whitespace-pre-wrap break-all bg-[#dbeafe]/40 text-xs">
                {argsText}
              </pre>
            </>
          )}
          {running && (
            <div
              data-slot="tool-call-status"
              className="flex items-center gap-2 text-xs text-[#2563eb]/70"
            >
              <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-[#2563eb]/25 border-t-[#2563eb]" />
              {runningLabel}
            </div>
          )}
          {result != null && result !== "" && (
            <>
              <div className="text-xs opacity-70">结果</div>
              <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-all bg-[#dbeafe]/40 text-xs">
                {String(result)}
              </pre>
            </>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
