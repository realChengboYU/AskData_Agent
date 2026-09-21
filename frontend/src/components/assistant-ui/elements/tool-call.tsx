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
