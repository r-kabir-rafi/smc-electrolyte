export const chartTheme = {
  background: "transparent",
  textColor: "var(--text-secondary)",
  fontSize: 12,
  fontFamily: "var(--font-mono)",
  axis: {
    ticks: { line: { stroke: "var(--border-subtle)" } },
    domain: { line: { stroke: "var(--border-subtle)" } },
  },
  grid: {
    line: { stroke: "var(--border-subtle)", strokeDasharray: "4 4" },
  },
  tooltip: {
    container: {
      background: "var(--bg-elevated)",
      border: "1px solid var(--border-default)",
      borderRadius: "var(--radius-md)",
      color: "var(--text-primary)",
      fontSize: 13,
      fontFamily: "var(--font-body)",
      boxShadow: "var(--shadow-md)",
    },
  },
} as const;

export const tierColorStops = ["#3b82f6", "#22c55e", "#eab308", "#f97316", "#ef4444"];

export const fanChartColors = {
  outerBand: "rgba(249,115,22,0.10)",
  innerBand: "rgba(249,115,22,0.20)",
  line: "#f97316",
  threshold: "#ef4444",
} as const;
