"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSuggestion, QueryRow } from "@/lib/api";

// Fixed-order categorical palette (light/dark), validated for CVD-safe
// adjacent contrast. Never cycle or reassign by rank — see dataviz skill.
const CATEGORICAL_LIGHT = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
  "#e34948",
];
const CATEGORICAL_DARK = [
  "#3987e5",
  "#d95926",
  "#199e70",
  "#c98500",
  "#d55181",
  "#008300",
  "#9085e9",
  "#e66767",
];

const CHROME_LIGHT = { grid: "#e1e0d9", axis: "#c3c2b7", tick: "#898781" };
const CHROME_DARK = { grid: "#2c2c2a", axis: "#383835", tick: "#898781" };

function useIsDarkMode(): boolean {
  const [isDark, setIsDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = (event: MediaQueryListEvent) => setIsDark(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  return isDark;
}

function toNumber(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

interface ResultChartProps {
  chart: ChartSuggestion;
  rows: QueryRow[];
}

export function ResultChart({ chart, rows }: ResultChartProps) {
  const isDark = useIsDarkMode();
  const series = isDark ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;
  const chrome = isDark ? CHROME_DARK : CHROME_LIGHT;

  const data = rows.map((row) => ({
    ...row,
    [chart.y]: toNumber(row[chart.y]),
  }));

  if (data.length === 0) return null;

  if (chart.type === "pie") {
    // Fold anything past the 8-slot categorical order into "Other" rather
    // than generating a 9th hue.
    const MAX_SLICES = 8;
    const sliced =
      data.length > MAX_SLICES
        ? [
            ...data.slice(0, MAX_SLICES - 1),
            {
              [chart.x]: "Other",
              [chart.y]: data
                .slice(MAX_SLICES - 1)
                .reduce((sum, row) => sum + toNumber(row[chart.y]), 0),
            },
          ]
        : data;

    return (
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Tooltip
            contentStyle={{
              background: isDark ? "#1a1a19" : "#fcfcfb",
              border: `1px solid ${chrome.grid}`,
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: chrome.tick }} />
          <Pie
            data={sliced}
            dataKey={chart.y}
            nameKey={chart.x}
            innerRadius={0}
            outerRadius={90}
            stroke={isDark ? "#1a1a19" : "#fcfcfb"}
            strokeWidth={2}
          >
            {sliced.map((_, index) => (
              <Cell key={index} fill={series[index % series.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    );
  }

  const axisStyle = { fontSize: 12, fill: chrome.tick };

  if (chart.type === "line") {
    return (
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={chrome.grid} vertical={false} />
          <XAxis dataKey={chart.x} tick={axisStyle} stroke={chrome.axis} />
          <YAxis tick={axisStyle} stroke={chrome.axis} />
          <Tooltip
            contentStyle={{
              background: isDark ? "#1a1a19" : "#fcfcfb",
              border: `1px solid ${chrome.grid}`,
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Line
            type="monotone"
            dataKey={chart.y}
            stroke={series[0]}
            strokeWidth={2}
            dot={{ r: 4, fill: series[0] }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={chrome.grid} vertical={false} />
        <XAxis dataKey={chart.x} tick={axisStyle} stroke={chrome.axis} />
        <YAxis tick={axisStyle} stroke={chrome.axis} />
        <Tooltip
          cursor={{ fill: isDark ? "rgba(255,255,255,0.06)" : "rgba(11,11,11,0.04)" }}
          contentStyle={{
            background: isDark ? "#1a1a19" : "#fcfcfb",
            border: `1px solid ${chrome.grid}`,
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Bar dataKey={chart.y} fill={series[0]} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
