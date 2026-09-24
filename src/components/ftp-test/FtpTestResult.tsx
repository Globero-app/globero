import { tr } from "@/lib/i18n";import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { saveFtpTest } from "@/lib/ftp-tests.functions";
import { useAuth } from "@/lib/use-auth";
import { toast } from "sonner";
import { computePowerZones, computeHrZones, ftpFrom20Min, lthrFrom20Min } from "@/lib/zones";

export function FtpTestResult({ profile, onRepeat }: {profile: any;onRepeat: () => void;}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const saveTest = useServerFn(saveFtpTest);
  const [avgWatts, setAvgWatts] = useState("");
  const [avgHr, setAvgHr] = useState("");
  const [saved, setSaved] = useState<number | null>(null);

  const estimatedFtp = useMemo(() => {
    const n = Number(avgWatts);
    return n > 0 ? ftpFrom20Min(n) : null;
  }, [avgWatts]);

  const estimatedLthr = useMemo(() => {
    const n = Number(avgHr);
    return n > 0 ? lthrFrom20Min(n) : null;
  }, [avgHr]);

  const powerZones = useMemo(() => computePowerZones(estimatedFtp), [estimatedFtp]);
  const hrZones = useMemo(() => computeHrZones(estimatedLthr, profile?.max_hr ?? null), [estimatedLthr, profile?.max_hr]);
  const [zonesMode, setZonesMode] = useState<"watts" | "hr">(profile?.zones_display_mode as any || "watts");
  useEffect(() => {
    if (profile?.zones_display_mode) setZonesMode(profile.zones_display_mode as any);
  }, [profile?.zones_display_mode]);
  const zones = zonesMode === "hr" ? hrZones : powerZones;
  const unit = zonesMode === "hr" ? "bpm" : "W";

  const save = async () => {
    if (!user) {toast.error(tr("Debes iniciar sesión"));return;}
    if (!estimatedFtp && !estimatedLthr) {toast.error(tr("Introduce potencia media o FC media de los 20 min"));return;}
    try {
      await saveTest({
        data: {
          avg_watts_20min: Number(avgWatts) > 0 ? Number(avgWatts) : null,
          avg_hr_20min: Number(avgHr) > 0 ? Number(avgHr) : null,
          ftp: estimatedFtp,
          lthr: estimatedLthr,
          source: "manual"
        }
      } as any);
    } catch (e: any) {
      return toast.error(e?.message ?? tr("No se pudo guardar el test"));
    }
    setSaved(estimatedFtp ?? 0);
    qc.invalidateQueries({ queryKey: ["profile"] });
    qc.invalidateQueries({ queryKey: ["ftp-tests"] });
    qc.invalidateQueries({ queryKey: ["progress"] });
    qc.invalidateQueries({ queryKey: ["threshold-status"] });
    qc.invalidateQueries({ queryKey: ["athlete-profile"] });
    const parts = [
    estimatedFtp ? `FTP: ${estimatedFtp} W` : null,
    estimatedLthr ? `LTHR: ${estimatedLthr} bpm` : null].
    filter(Boolean).join(" · ");
    toast.success(`Guardado (${parts}). Zonas calculadas.`);
  };

  return (
    <div className="space-y-6">
      <div className="bg-surface border rounded-xl p-6 space-y-4">
        <h2 className="font-display text-2xl font-bold uppercase tracking-tight">{tr("Resultado")}</h2>
        <p className="text-sm text-muted-foreground">{tr("Introduce la potencia media de los 20 min all-out (dato de tu ciclocomputador / plato). Si no tienes potenciómetro, apunta la FC media como referencia.")}</p>

        <div className="grid md:grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{tr("Potencia media 20 min (W)")}</span>
            <input type="number" value={avgWatts} onChange={(e) => setAvgWatts(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border bg-surface text-xl font-bold" placeholder="230" />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{tr("FC media 20 min (bpm, opcional)")}</span>
            <input type="number" value={avgHr} onChange={(e) => setAvgHr(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg border bg-surface text-xl font-bold" placeholder="168" />
          </label>
        </div>

        {estimatedFtp &&
        <div className="rounded-lg bg-primary/10 border border-primary/30 p-4">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-primary">{tr("FTP estimado (95%)")}</p>
            <p className="font-display text-4xl font-bold">{estimatedFtp} {tr("W")}</p>
          </div>
        }
        {estimatedLthr &&
        <div className="rounded-lg bg-primary/10 border border-primary/30 p-4">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-primary">{tr("LTHR estimado (95% FC media)")}</p>
            <p className="font-display text-4xl font-bold">{estimatedLthr} {tr("bpm")}</p>
          </div>
        }

        <div className="flex gap-2">
          <button onClick={save} disabled={!estimatedFtp} className="bg-primary text-primary-foreground px-5 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"> {tr("Guardar FTP y calcular zonas")} 

          </button>
          <button onClick={onRepeat} className="border px-5 py-2.5 rounded-lg text-sm font-semibold">{tr("Repetir test")}</button>
        </div>
      </div>

      {zones &&
      <div className="bg-surface border rounded-xl p-6 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-display text-lg font-bold uppercase tracking-tight">
              {zonesMode === "hr" ? "Zonas de FC (Friel)" : "Zonas de potencia (Coggan)"}
            </h3>
            <div className="inline-flex rounded-md border bg-surface p-0.5 text-xs font-semibold">
              <button type="button" onClick={() => setZonesMode("watts")} disabled={!powerZones} className={`px-3 py-1 rounded-sm disabled:opacity-40 ${zonesMode === "watts" ? "bg-primary text-primary-foreground" : ""}`}>{tr("Vatios")}</button>
              <button type="button" onClick={() => setZonesMode("hr")} disabled={!hrZones} className={`px-3 py-1 rounded-sm disabled:opacity-40 ${zonesMode === "hr" ? "bg-primary text-primary-foreground" : ""}`}>{tr("Pulsaciones")}</button>
            </div>
          </div>
          <div className="space-y-2">
            {zones.map((z) =>
          <div key={z.key} className="flex items-center gap-3 text-sm">
                <span className="inline-block size-3 rounded-full" style={{ background: z.color }} />
                <span className="font-semibold w-40">{z.label}</span>
                <span className="font-mono text-xs text-muted-foreground w-24">{z.pctLow}–{z.pctHigh === 999 ? "∞" : z.pctHigh}% {zonesMode === "hr" ? "LTHR" : "FTP"}</span>
                <span className="font-mono font-bold">
                  {z.low}{z.high === Infinity ? "+" : `–${z.high}`} {unit}
                </span>
                <span className="text-xs text-muted-foreground flex-1 hidden md:block">{z.focus}</span>
              </div>
          )}
          </div>
          {saved &&
        <p className="text-xs text-emerald-600 font-semibold pt-2"> {tr("✓ Guardado en tu perfil. La IA usará estas zonas al generar entrenamientos.")}
          {" "}
              <Link to="/entrenamientos" className="underline">{tr("Generar entrenamientos →")}</Link>
            </p>
        }
        </div>
      }
    </div>);

}
