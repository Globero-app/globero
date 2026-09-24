import { tr } from "@/lib/i18n";import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/use-auth";
import { Section, Field } from "@/components/perfil/Section";
import { getAthleteProfile, saveAthletePreferences, recomputeAthleteProfile } from "@/lib/athlete-profile.functions";

const DAYS: Array<[string, string]> = [
["1", "Lunes"], ["2", "Martes"], ["3", "Miércoles"], ["4", "Jueves"],
["5", "Viernes"], ["6", "Sábado"], ["0", "Domingo"]];


const TYPE_LABEL: Record<string, string> = {
  sprinter: "Sprinter", rodador: "Rodador", escalador: "Escalador", contrarrelojista: "Contrarrelojista"
};

export function AthleteProfileSection() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const load = useServerFn(getAthleteProfile);
  const save = useServerFn(saveAthletePreferences);
  const recompute = useServerFn(recomputeAthleteProfile);

  const q = useQuery({
    queryKey: ["athlete-profile", user?.id],
    queryFn: () => load({ data: {} } as any),
    enabled: !!user?.id,
    retry: false,
    staleTime: 60_000
  });

  const [avail, setAvail] = useState<Record<string, string>>({});
  const [prefs, setPrefs] = useState({ preferred_hour: "", indoor_tolerance: "media", terrain: "mixto", natural_cadence: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d: any = q.data;
    if (!d) return;
    const a: Record<string, string> = {};
    for (const [k, v] of Object.entries((d.availability_minutes ?? {}) as Record<string, unknown>)) {
      if (v != null && Number(v) > 0) a[k] = String(v);
    }
    setAvail(a);
    setPrefs({
      preferred_hour: d.preferred_hour != null ? String(d.preferred_hour) : "",
      indoor_tolerance: d.indoor_tolerance ?? "media",
      terrain: d.terrain ?? "mixto",
      natural_cadence: d.natural_cadence != null ? String(d.natural_cadence) : ""
    });
  }, [q.data]);

  const d: any = q.data;

  const onSave = async () => {
    setBusy(true);
    try {
      const availability_minutes: Record<string, number | null> = {};
      for (const [k, v] of Object.entries(avail)) {
        const n = Number(v);
        availability_minutes[k] = v !== "" && Number.isFinite(n) && n > 0 ? Math.min(360, Math.round(n)) : null;
      }
      await save({
        data: {
          availability_minutes,
          preferred_hour: prefs.preferred_hour === "" ? null : Number(prefs.preferred_hour),
          indoor_tolerance: prefs.indoor_tolerance,
          terrain: prefs.terrain,
          natural_cadence: prefs.natural_cadence === "" ? null : Number(prefs.natural_cadence)
        }
      } as any);
      toast.success("Preferencias guardadas");
      qc.invalidateQueries({ queryKey: ["athlete-profile", user?.id] });
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  };

  const onRecompute = async () => {
    setBusy(true);
    try {
      await recompute({ data: {} } as any);
      toast.success("Ficha recalculada con tus datos");
      qc.invalidateQueries({ queryKey: ["athlete-profile", user?.id] });
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo recalcular");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title={tr("Mi ficha de entrenamiento")} className="lg:col-span-2">
      {q.isLoading ?
      <Skeleton className="h-32 w-full rounded-lg" /> :

      <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label={tr("Tipo detectado")} value={d?.detected_type ? TYPE_LABEL[d.detected_type] ?? d.detected_type : "aún sin datos"} />
            <Stat label={tr("20 min")} value={d?.peak_20m ? `${d.peak_20m} W${d.wkg_20m ? ` · ${d.wkg_20m} W/kg` : ""}` : "aún sin datos"} />
            <Stat label={tr("5 min")} value={d?.peak_5m ? `${d.peak_5m} W` : "aún sin datos"} />
            <Stat label={tr("1 min / 5 s")} value={d?.peak_1m || d?.peak_5s ? `${d?.peak_1m ?? "—"} / ${d?.peak_5s ?? "—"} W` : "aún sin datos"} />
            <Stat label={tr("Potencia crítica (CP)")} value={d?.cp_watts ? `${d.cp_watts} W` : "aún sin datos"} />
            <Stat label={tr("W' (reserva anaeróbica)")} value={d?.w_prime_kj ? `${d.w_prime_kj} kJ` : "aún sin datos"} />
            <Stat label={tr("FRC")} value={d?.frc_kj ? `${d.frc_kj} kJ` : "aún sin datos"} />
            <Stat label={tr("Techo carga semanal")} value={d?.weekly_tss_ceiling ? `${d.weekly_tss_ceiling} TSS` : "aún sin datos"} />
            <Stat label={tr("Umbral de frescura")} value={d?.tsb_recovery_threshold != null ? `TSB ${d.tsb_recovery_threshold}` : "aún sin datos"} />
            <Stat label={tr("Readiness bajo")} value={d?.readiness_low_threshold != null ? `${d.readiness_low_threshold}/5` : "aún sin datos"} />
            <Stat label={tr("Recuperación")} value={d?.recovery_days_after_hard != null ? `${d.recovery_days_after_hard} días · descarga cada ${d.deload_every_weeks ?? "—"} sem.` : "aún sin datos"} />
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[11px] text-muted-foreground">
              {d?.computed_at ? `Calculado el ${new Date(d.computed_at).toLocaleDateString("es-ES")} con tus propias actividades.` : "Se calculará automáticamente cuando tengas actividades y readiness suficientes."}
            </p>
            <button type="button" className="border px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1 hover:bg-secondary" disabled={busy} onClick={onRecompute}>
              <RefreshCw className="size-3" /> {tr("Recalcular ahora")} 
          </button>
          </div>

          <div className="border-t pt-3 space-y-3">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{tr("Minutos disponibles por día (vacío = duración por defecto)")}</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {DAYS.map(([dow, label]) =>
            <Field key={dow} label={label}>
                  <input
                type="number" min={0} max={360} step={5} className="input" placeholder="—"
                value={avail[dow] ?? ""}
                onChange={(e) => setAvail({ ...avail, [dow]: e.target.value })} />
              
                </Field>
            )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label={tr("Hora habitual")}>
                <input type="number" min={0} max={23} className="input" placeholder="—" value={prefs.preferred_hour} onChange={(e) => setPrefs({ ...prefs, preferred_hour: e.target.value })} />
              </Field>
              <Field label={tr("Tolerancia al rodillo")}>
                <select className="input" value={prefs.indoor_tolerance} onChange={(e) => setPrefs({ ...prefs, indoor_tolerance: e.target.value })}>
                  <option value="baja">{tr("Baja")}</option>
                  <option value="media">{tr("Media")}</option>
                  <option value="alta">{tr("Alta")}</option>
                </select>
              </Field>
              <Field label={tr("Terreno disponible")}>
                <select className="input" value={prefs.terrain} onChange={(e) => setPrefs({ ...prefs, terrain: e.target.value })}>
                  <option value="llano">{tr("Llano")}</option>
                  <option value="montana">{tr("Montaña")}</option>
                  <option value="mixto">{tr("Mixto")}</option>
                </select>
              </Field>
              <Field label={tr("Cadencia natural (rpm)")}>
                <input type="number" min={50} max={120} className="input" placeholder="—" value={prefs.natural_cadence} onChange={(e) => setPrefs({ ...prefs, natural_cadence: e.target.value })} />
              </Field>
            </div>

            <button type="button" className="bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-semibold text-sm hover:opacity-90 w-full sm:w-auto" disabled={busy} onClick={onSave}> {tr("Guardar preferencias")} 

          </button>
            <p className="text-[11px] text-muted-foreground"> {tr("Se aplican a los próximos entrenamientos que se generen. Solo afectan a tu cuenta.")} 

          </p>
          </div>
        </>
      }
    </Section>);

}

function Stat({ label, value }: {label: string;value: string;}) {
  return (
    <div className="rounded-lg bg-secondary/40 p-3">
      <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</p>
      <p className="font-display text-sm font-bold mt-1 break-words">{value}</p>
    </div>);

}
