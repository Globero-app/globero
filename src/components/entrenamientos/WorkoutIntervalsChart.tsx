import { tr } from "@/lib/i18n";import { useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis } from
"recharts";
import { Button } from "@/components/ui/button";
import { computeHrZones, computePowerZones, describeStepZone } from "@/lib/zones";
import type { ZoneRefs } from "./WorkoutCard";

type Metric = "power" | "hr";

type ChartPoint = {
  minute: number;
  value: number | null;
  low: number | null;
  high: number | null;
  name: string;
  zone: string;
  color: string;
};

type Segment = ChartPoint & {endMinute: number;};

const FALLBACK_COLOR = "var(--muted-foreground)";

function buildChartData(steps: any[], metric: Metric, refs: ZoneRefs) {
  let elapsedSeconds = 0;
  const segments: Segment[] = [];

  for (const step of steps) {
    const duration = Math.max(0, Number(step?.duration_seconds) || 0);
    const startMinute = elapsedSeconds / 60;
    elapsedSeconds += duration;
    if (duration <= 0 || step?.target !== metric) continue;

    const low = Number(step?.target_low) || 0;
    const high = Number(step?.target_high) || low;
    if (low <= 0) continue;
    const zone = describeStepZone(step, refs);
    segments.push({
      minute: startMinute,
      endMinute: elapsedSeconds / 60,
      value: Math.round((low + high) / 2),
      low,
      high,
      name: String(step?.name ?? "Bloque"),
      zone: zone?.zone.label ?? "Objetivo",
      color: zone?.zone.color ?? FALLBACK_COLOR
    });
  }

  const points: ChartPoint[] = [];
  for (const segment of segments) {
    points.push(segment, { ...segment, minute: segment.endMinute });
  }
  return { points, segments, totalMinutes: elapsedSeconds / 60 };
}

function formatMinute(value: number) {
  const rounded = Math.round(value);
  if (rounded < 60) return `${rounded}′`;
  return `${Math.floor(rounded / 60)}h${rounded % 60 ? ` ${rounded % 60}′` : ""}`;
}

function IntervalTooltip({ active, payload, metric }: any) {
  const point = payload?.[0]?.payload as ChartPoint | undefined;
  if (!active || !point || point.value == null) return null;
  const unit = metric === "power" ? "W" : "ppm";
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="font-semibold">{point.name}</p>
      <p className="text-muted-foreground">{tr("Minuto")} {formatMinute(point.minute)}</p>
      <p className="mt-1 font-mono">{point.low}–{point.high} {unit}</p>
      <p className="font-medium" style={{ color: point.color }}>{point.zone}</p>
    </div>);

}

export function WorkoutIntervalsChart({
  steps,
  refs,
  expanded = false




}: {steps: any[] | undefined;refs: ZoneRefs;expanded?: boolean;}) {
  const safeSteps = Array.isArray(steps) ? steps : [];
  const hasPower = safeSteps.some((step) => step?.target === "power" && Number(step?.target_low) > 0);
  const hasHr = safeSteps.some((step) => step?.target === "hr" && Number(step?.target_low) > 0);
  const [selectedMetric, setSelectedMetric] = useState<Metric>(hasPower ? "power" : "hr");
  const metric = selectedMetric === "power" && !hasPower ? "hr" : selectedMetric === "hr" && !hasHr ? "power" : selectedMetric;
  const chart = useMemo(() => buildChartData(safeSteps, metric, refs), [safeSteps, metric, refs]);
  const zones = metric === "power" ? computePowerZones(refs.ftp) : computeHrZones(refs.lthr, refs.maxHr);
  const maxTarget = chart.segments.reduce((max, segment) => Math.max(max, segment.high ?? 0), 0);
  const yMax = Math.max(maxTarget, ...(zones?.map((zone) => zone.high === Infinity ? zone.low * 1.12 : zone.high) ?? [0]));

  if (!hasPower && !hasHr) return null;

  return (
    <div className={expanded ? "mt-3" : "mt-2"}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-mono uppercase text-muted-foreground">{tr("Intervalos por zonas")}</p>
        {hasPower && hasHr &&
        <div className="flex rounded-md border bg-surface p-0.5" aria-label={tr("Métrica del gráfico")}>
            <Button type="button" variant={metric === "power" ? "default" : "ghost"} size="sm" className="h-6 px-2 text-[10px]" onClick={() => setSelectedMetric("power")}>{tr("Potencia")}</Button>
            <Button type="button" variant={metric === "hr" ? "default" : "ghost"} size="sm" className="h-6 px-2 text-[10px]" onClick={() => setSelectedMetric("hr")}>{tr("FC")}</Button>
          </div>
        }
      </div>
      <div className={expanded ? "h-56 w-full" : "h-28 w-full max-w-2xl"}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chart.points} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            {zones?.map((zone) =>
            <ReferenceArea
              key={zone.key}
              y1={zone.low}
              y2={zone.high === Infinity ? yMax : zone.high}
              fill={zone.color}
              fillOpacity={0.08}
              ifOverflow="extendDomain" />

            )}
            {chart.segments.map((segment, index) =>
            <ReferenceArea
              key={`${segment.minute}-${index}`}
              x1={segment.minute}
              x2={segment.endMinute}
              y1={segment.low ?? 0}
              y2={segment.high ?? 0}
              fill={segment.color}
              fillOpacity={0.32}
              stroke={segment.color}
              strokeOpacity={0.7} />

            )}
            <XAxis
              type="number"
              dataKey="minute"
              domain={[0, Math.max(chart.totalMinutes, 1)]}
              tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
              tickFormatter={formatMinute}
              axisLine={false}
              tickLine={false} />
            
            <YAxis
              domain={[0, Math.ceil(yMax * 1.05)]}
              tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              width={46}
              unit={metric === "power" ? "W" : ""} />
            
            <Tooltip content={<IntervalTooltip metric={metric} />} cursor={{ stroke: "var(--foreground)", strokeOpacity: 0.25 }} />
            <Line
              type="stepAfter"
              dataKey="value"
              stroke="var(--foreground)"
              strokeWidth={expanded ? 2 : 1.5}
              dot={false}
              activeDot={{ r: 4, fill: "var(--background)", stroke: "var(--foreground)" }}
              connectNulls={false}
              isAnimationActive={false} />
            
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {zones?.filter((zone) => chart.segments.some((segment) => segment.zone === zone.label)).map((zone) =>
        <span key={zone.key} className="inline-flex items-center gap-1 text-[9px] text-muted-foreground">
            <span className="size-2 rounded-sm" style={{ backgroundColor: zone.color }} />
            {zone.label.split(" · ")[0]}
          </span>
        )}
      </div>
    </div>);

}
