import { computePowerZones, computeHrZones } from "@/lib/zones";

export function ZonesPreview({
  ftp,
  lthr,
  maxHr,
  mode,
  onModeChange,
}: {
  ftp: number | null;
  lthr: number | null;
  maxHr: number | null;
  mode: string;
  onModeChange: (m: "watts" | "hr") => void;
}) {
  const powerZones = computePowerZones(ftp);
  const hrZones = computeHrZones(lthr, maxHr);
  const activeMode: "watts" | "hr" = mode === "hr" ? "hr" : "watts";
  const zones = activeMode === "hr" ? hrZones : powerZones;
  if (!powerZones && !hrZones) return null;
  const unit = activeMode === "hr" ? "bpm" : "W";
  const ref = activeMode === "hr" ? (lthr || (maxHr ? Math.round(maxHr * 0.92) : null)) : ftp;
  return (
    <div className="mt-3 rounded-lg border bg-muted/30 p-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
          {activeMode === "hr" ? "Zonas de FC (Friel)" : "Zonas de potencia (Coggan)"} · ref {ref ?? "—"} {unit}
        </p>
        <div className="inline-flex rounded-md border bg-surface p-0.5 text-[10px] font-semibold">
          <button type="button" onClick={() => onModeChange("watts")} disabled={!powerZones} className={`px-2 py-0.5 rounded-sm disabled:opacity-40 ${activeMode === "watts" ? "bg-primary text-primary-foreground" : ""}`}>W</button>
          <button type="button" onClick={() => onModeChange("hr")} disabled={!hrZones} className={`px-2 py-0.5 rounded-sm disabled:opacity-40 ${activeMode === "hr" ? "bg-primary text-primary-foreground" : ""}`}>FC</button>
        </div>
      </div>
      {!zones && (
        <p className="text-[11px] text-muted-foreground">
          {activeMode === "hr" ? "Introduce tu FC máx o LTHR para ver las zonas por pulsaciones." : "Introduce tu FTP para ver las zonas de potencia."}
        </p>
      )}
      {zones && (
        <div className="grid grid-cols-1 gap-1 text-xs">
          {zones.map((z) => (
            <div key={z.key} className="flex items-center gap-2">
              <span className="inline-block size-2.5 rounded-full shrink-0" style={{ background: z.color }} />
              <span className="font-semibold truncate">{z.label}</span>
              <span className="ml-auto font-mono tabular-nums">
                {z.low}{z.high === Infinity ? "+" : `–${z.high}`} {unit}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
