import { useMemo } from "react";
import * as echarts from "echarts";
import ReactECharts from "echarts-for-react";
import { westerosTheme } from "@/echarts/westeros";

// 注册一次 westeros 主题（模块级，只跑一次；重复注册无害）
echarts.registerTheme("westeros", westerosTheme);

/**
 * ChartSpec 结构（后端/模型产出）：
 * { chartType: "bar"|"line"|"pie", title, categories, series:[{name,data}], xName, yName, legend, area }
 */
const AXIS_STYLE = {
  axisLabel: { color: "#516b91" },
  axisLine: { lineStyle: { color: "#cccccc" } },
};

function buildOption(spec) {
  const type = spec?.chartType;
  const categories = spec?.categories ?? [];
  const series = (spec?.series ?? []).filter((s) => s?.data?.length);
  const legend =
    spec?.legend !== false && (series.length > 1 || type === "pie");

  const base = {
    title: spec?.title ? { text: spec.title, left: "center", top: 4 } : undefined,
    tooltip:
      type === "pie"
        ? { trigger: "item", formatter: "{b}: {c} ({d}%)" }
        : { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: legend
      ? { show: true, top: type === "pie" ? 6 : 24, left: "center" }
      : undefined,
    grid: { left: "4%", right: "4%", bottom: "8%", top: 70, containLabel: true },
    color: westerosTheme.color,
  };

  if (type === "pie") {
    const data = categories.map((name, i) => ({
      name,
      value: (series[0]?.data?.[i] ?? 0) === 0 ? 0 : (series[0]?.data?.[i] ?? 0),
    }));
    return {
      ...base,
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      series: [
        {
          type: "pie",
          radius: ["38%", "66%"],
          center: ["50%", "56%"],
          data,
          label: { color: "#516b91", formatter: "{b}\n{d}%" },
          itemStyle: { borderColor: "#fff", borderWidth: 2 },
        },
      ],
    };
  }

  const isLine = type === "line";
  return {
    ...base,
    xAxis: {
      type: "category",
      data: categories,
      name: spec?.xName,
      ...AXIS_STYLE,
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      name: spec?.yName,
      ...AXIS_STYLE,
      splitLine: { lineStyle: { color: "#eeeeee" } },
    },
    series: series.map((s, i) => ({
      name: s.name,
      type: isLine ? "line" : "bar",
      data: s.data,
      smooth: isLine,
      barMaxWidth: 44,
      // bar: 同色系浅色
      itemStyle: isLine
        ? {}
        : { color: westerosTheme.color[i % westerosTheme.color.length], borderRadius: [4, 4, 0, 0] },
      areaStyle: isLine && spec?.area !== false ? { opacity: 0.18 } : undefined,
      lineStyle: isLine ? { width: 2 } : undefined,
    })),
  };
}

export default function Chart({ spec }) {
  const option = useMemo(() => buildOption(spec), [spec]);
  return (
    <div
      data-slot="aui_chart"
      className="my-2 overflow-hidden rounded-xl border border-[#dbeafe] bg-white/70 p-2"
    >
      <ReactECharts
        option={option}
        theme="westeros"
        style={{ height: 340, width: "100%" }}
        notMerge
        opts={{ renderer: "canvas" }}
      />
    </div>
  );
}
