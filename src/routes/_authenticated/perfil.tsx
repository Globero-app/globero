import { GlucoseLog } from "@/components/perfil/GlucoseLog";
import { tr } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { syncIntervalsZones, intervalsEstimateFtp, intervalsEstimateHr } from "@/lib/intervals.functions";
import { Wand2, Settings } from "lucide-react";
import { syncWahooZones } from "@/lib/wahoo.functions";
import { syncHammerheadMetrics } from "@/lib/hammerhead.functions";
import { Link } from "@tanstack/react-router";
import { Section, Field, Collapsible } from "@/components/perfil/Section";
import { ZonesPreview } from "@/components/perfil/ZonesPreview";
import { DeleteAccountSection } from "@/components/perfil/DeleteAccountSection";

import { AthleteProfileSection } from "@/components/perfil/AthleteProfileSection";
import { SubscriptionPanel } from "@/components/SubscriptionPanel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";




export const Route = createFileRoute("/_authenticated/perfil")({
  validateSearch: (search: Record<string, unknown>): { tab?: "profile" | "subscription" } => ({
    tab: search.tab === "subscription" || search.tab === "profile" ? search.tab : undefined,
  }),
  head: () => ({ meta: [
    { title: "Perfil — Globero" },
    { name: "description", content: "Gestiona tus datos personales, perfil ciclista, zonas y preferencias nutricionales." },
    { property: "og:title", content: "Perfil — Globero" },
    { property: "og:description", content: "Gestiona tus datos personales, perfil ciclista, zonas y preferencias nutricionales." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PerfilPage
});

function PerfilPage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const estimateFtp = useServerFn(intervalsEstimateFtp);
  const estimateHr = useServerFn(intervalsEstimateHr);
  const syncZonesIcu = useServerFn(syncIntervalsZones);
  const syncZonesWahoo = useServerFn(syncWahooZones);
  const syncHammerhead = useServerFn(syncHammerheadMetrics);


  const profileQ = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user
  });

  const [form, setForm] = useState<any>({});
  useEffect(() => {if (profileQ.data) setForm(profileQ.data);}, [profileQ.data]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.from("profiles").upsert({
      id: user!.id,
      email: user!.email ?? "",
      full_name: form.full_name,
      age: form.age ? Number(form.age) : null,
      gender: form.gender,
      weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
      height_cm: form.height_cm ? Number(form.height_cm) : null,
      ftp: form.ftp ? Number(form.ftp) : null,
      max_hr: form.max_hr ? Number(form.max_hr) : null,
      lthr: form.lthr ? Number(form.lthr) : null,
      zones_display_mode: form.zones_display_mode || "watts",

      cyclist_type: form.cyclist_type || "mixto",
      strengths: form.strengths || null,
      weaknesses: form.weaknesses || null,
      country: form.country || "ES",
      dietary_preferences: form.dietary_preferences,
      has_diabetes: !!form.has_diabetes,
      diabetes_type: form.has_diabetes ? form.diabetes_type || null : null,
      cgm_device: form.has_diabetes ? form.cgm_device || null : null
    }, { onConflict: "id" });
    if (error) toast.error(error.message);else
    {
      toast.success(tr("Perfil guardado"));
      qc.invalidateQueries({ queryKey: ["profile"] });
      if (profileQ.data?.intervals_athlete_id && profileQ.data?.intervals_api_key) {
        try {
          const r = await syncZonesIcu({ data: undefined });
          if (r.ok) toast.success(tr("Zonas sincronizadas con Intervals.icu"));
        } catch (err: any) {toast.error(`Intervals.icu: ${err.message}`);}
      }
      const zonesChanged = ["ftp", "lthr", "max_hr"].some((k) => String(form[k] ?? "") !== String((profileQ.data as any)?.[k] ?? ""));
      if (zonesChanged && (profileQ.data as any)?.wahoo_access_token) {
        try {
          const r = await syncZonesWahoo({ data: undefined });
          if (r.ok) toast.success(tr("Zonas actualizadas en Wahoo. Abre la app Wahoo cerca del ELEMNT para sincronizar el dispositivo."));
        } catch (err: any) {toast.error(`Wahoo: ${err.message}`);}
      }
      const metricsChanged = zonesChanged || String(form.weight_kg ?? "") !== String((profileQ.data as any)?.weight_kg ?? "");
      if (metricsChanged && (profileQ.data as any)?.hammerhead_access_token) {
        try {
          const r = await syncHammerhead({ data: undefined });
          if (r.ok) toast.success(tr("Zonas y peso actualizados en Hammerhead"));
        } catch (err: any) {toast.error(`Hammerhead: ${err.message}`);}
      }
    }
  };

  const icuConnected = !!profileQ.data?.intervals_api_key;

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{tr("Configuración personal")}</p>
          <h1 className="font-display text-4xl font-bold uppercase tracking-tight">{tr("Tu Perfil")}</h1>
        </div>
        <Link to="/ajustes" aria-label={tr("Ajustes")} title={tr("Ajustes")} className="shrink-0 inline-flex size-10 items-center justify-center rounded-full border bg-card text-muted-foreground transition-colors hover:text-foreground hover:bg-muted">
          <Settings className="size-5" />
        </Link>
      </div>

      <Tabs value={tab ?? "profile"} onValueChange={(value) => { void navigate({ search: { tab: value === "subscription" ? "subscription" : "profile" }, replace: true }); }} className="space-y-6">
        <TabsList aria-label="Secciones de Perfil">
          <TabsTrigger value="profile">{tr("Perfil")}</TabsTrigger>
          <TabsTrigger value="subscription">{tr("Suscripción")}</TabsTrigger>
        </TabsList>
        <TabsContent value="subscription"><SubscriptionPanel /></TabsContent>
        <TabsContent value="profile" className="space-y-8">
      {(() => {
        const ftp = Number(profileQ.data?.ftp) || 0, w = Number(profileQ.data?.weight_kg) || 0, lthr = profileQ.data?.lthr;
        const M = ({ l, v, u }: { l: string; v: string; u?: string }) => (
          <div className="min-w-0"><p className="text-xs text-muted-foreground truncate">{l}</p><p className="font-display text-2xl font-bold">{v}{u && <span className="ml-1 text-sm font-normal text-muted-foreground">{u}</span>}</p></div>
        );
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-2xl bg-muted p-5">
            <M l="FTP" v={ftp ? String(ftp) : "—"} u={ftp ? "W" : undefined} />
            <M l="W/kg" v={ftp && w ? (ftp / w).toFixed(1) : "—"} />
            <M l={tr("Peso")} v={w ? String(w) : "—"} u={w ? "kg" : undefined} />
            <M l={tr("Umbral FC")} v={lthr ? String(lthr) : "—"} u={lthr ? "ppm" : undefined} />
          </div>
        );
      })()}

      <form onSubmit={save} className="grid lg:grid-cols-2 gap-6">
        <Section title={tr("Datos personales")}>
          <Field label={tr("Nombre completo")}><input className="input" value={form.full_name ?? ""} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tr("Edad")}><input type="number" className="input" value={form.age ?? ""} onChange={(e) => setForm({ ...form, age: e.target.value })} /></Field>
            <Field label={tr("Sexo")}>
              <select className="input" value={form.gender ?? ""} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
                <option value="">—</option><option value="masculino">{tr("Masculino")}</option><option value="femenino">{tr("Femenino")}</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tr("Peso (kg)")}><input type="number" step="0.1" className="input" value={form.weight_kg ?? ""} onChange={(e) => setForm({ ...form, weight_kg: e.target.value })} /></Field>
            <Field label={tr("Altura (cm)")}><input type="number" className="input" value={form.height_cm ?? ""} onChange={(e) => setForm({ ...form, height_cm: e.target.value })} /></Field>
          </div>
          <Field label={tr("FTP (W)")}>
            <div className="flex gap-2">
              <input type="number" className="input" value={form.ftp ?? ""} onChange={(e) => setForm({ ...form, ftp: e.target.value })} />
              {!!icuConnected &&
              <button
                type="button"
                title={tr("Estimar FTP automáticamente desde tus actividades de Intervals.icu")}
                onClick={async () => {
                  try {
                    const r = await estimateFtp({ data: undefined });
                    setForm((f: any) => ({ ...f, ftp: r.ftp }));
                    toast.success(`FTP estimado: ${r.ftp} W`);
                    qc.invalidateQueries({ queryKey: ["profile"] });
                  } catch (e: any) {toast.error(e.message);}
                }}
                className="shrink-0 inline-flex items-center gap-1 px-3 rounded-lg border bg-surface text-xs font-semibold hover:bg-muted">
                
                  <Wand2 className="size-3.5" /> {tr("Auto")} 
              </button>
              }
            </div>
            {!!icuConnected &&
            <p className="mt-1 text-[10px] text-muted-foreground">{tr("Se calcula desde tus actividades de Intervals.icu con potencia. Puedes modificarlo manualmente.")}</p>
            }
            <div className="mt-2">
              <Link to="/ftp-test" className="text-xs font-semibold text-primary hover:underline">
                {tr("¿No conoces tu FTP? Hacer el test guiado de 20 min →")}
              </Link>
            </div>
            <div className="mt-3"><Collapsible title={tr("Zonas")}><ZonesPreview
              ftp={form.ftp ? Number(form.ftp) : null}
              lthr={form.lthr ? Number(form.lthr) : null}
              maxHr={form.max_hr ? Number(form.max_hr) : null}
              mode={form.zones_display_mode || "watts"}
              onModeChange={(m) => setForm({ ...form, zones_display_mode: m })} /></Collapsible></div>
            
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tr("FC máx (bpm)")}>
              <div className="flex gap-2">
                <input type="number" className="input" value={form.max_hr ?? ""} onChange={(e) => {
                  const v = e.target.value;
                  setForm((f: any) => {
                    const n = Number(v);
                    const auto = v && n > 0 ? String(Math.round(n * 0.92)) : f.lthr;
                    return { ...f, max_hr: v, lthr: auto };
                  });
                }} />
                {!!icuConnected &&
                <button
                  type="button"
                  title={tr("Estimar FC máx y LTHR desde tus actividades de Intervals.icu")}
                  onClick={async () => {
                    try {
                      const r = await estimateHr({ data: undefined });
                      setForm((f: any) => ({ ...f, max_hr: r.max_hr ?? f.max_hr, lthr: r.lthr ?? f.lthr }));
                      toast.success(`FC máx: ${r.max_hr ?? "—"} bpm · LTHR: ${r.lthr ?? "—"} bpm`);
                      qc.invalidateQueries({ queryKey: ["profile"] });
                    } catch (e: any) {toast.error(e.message);}
                  }}
                  className="shrink-0 inline-flex items-center gap-1 px-3 rounded-lg border bg-surface text-xs font-semibold hover:bg-muted">
                  
                    <Wand2 className="size-3.5" /> {tr("Auto")} 
                </button>
                }
              </div>
            </Field>
            <Field label={tr("Umbral FC / LTHR (bpm)")}>
              <input type="number" className="input" placeholder={tr("≈ 92% FCmáx")} value={form.lthr ?? ""} onChange={(e) => setForm({ ...form, lthr: e.target.value })} />
            </Field>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {icuConnected ?
            "Se calculan automáticamente desde tus actividades de Intervals.icu con pulsómetro (FC máx registrada y LTHR = mejor FC media de 20' × 0,95). Puedes modificarlos manualmente." :
            "LTHR = FC media del último 20' del test FTP × 0,95. Si no lo indicas, se estima como 92 % de tu FC máx."}
          </p>
        </Section>

        <Section title={tr("Perfil ciclista")}>
          <Field label={tr("Tipo de ciclista")}>
            <select className="input" value={form.cyclist_type ?? "mixto"} onChange={(e) => setForm({ ...form, cyclist_type: e.target.value })}>
              <option value="mixto">{tr("Mixto / sin definir")}</option>
              <option value="sprinter">{tr("Sprinter")}</option>
              <option value="rodador">{tr("Rodador")}</option>
              <option value="escalador">{tr("Escalador")}</option>
              <option value="contrarrelojista">{tr("Contrarrelojista")}</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tr("Fortalezas")}>
              <input className="input" placeholder={tr("Sprint, llano, larga distancia…")} value={form.strengths ?? ""} onChange={(e) => setForm({ ...form, strengths: e.target.value })} />
            </Field>
            <Field label={tr("Debilidades a trabajar")}>
              <input className="input" placeholder={tr("Subidas, final, crono…")} value={form.weaknesses ?? ""} onChange={(e) => setForm({ ...form, weaknesses: e.target.value })} />
            </Field>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {tr("La IA sesgará la distribución de carga según tu perfil: más sprint/VO₂max para sprinters, umbral para rodadores, Z2 y subidas para escaladores, y aeróbico constante para contrarrelojistas.")}
          </p>
        </Section>

        <AthleteProfileSection />

        <Section title={tr("Nutrición")}>
          <Field label={tr("Preferencias / intolerancias")}>
            <textarea className="input min-h-[80px]" placeholder={tr("Vegano, intolerancia lactosa, sin gluten…")} value={form.dietary_preferences ?? ""} onChange={(e) => setForm({ ...form, dietary_preferences: e.target.value })} />
          </Field>
          <p className="text-[11px] text-muted-foreground">{tr("Se tienen en cuenta siempre en el plan semanal y en el plan de competición (se adapta 5 días antes de cada carrera).")}</p>
        </Section>

        <Section title={tr("Diabetes")}>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!form.has_diabetes} onChange={(e) => setForm({ ...form, has_diabetes: e.target.checked })} />
            {tr("Tengo diabetes")}
          </label>
          {form.has_diabetes &&
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={tr("Tipo de diabetes")}>
              <select className="input" value={form.diabetes_type ?? ""} onChange={(e) => setForm({ ...form, diabetes_type: e.target.value })}>
                <option value="">—</option>
                <option value="type1">{tr("Tipo 1")}</option>
                <option value="type2">{tr("Tipo 2")}</option>
                <option value="lada">LADA</option>
                <option value="mody">MODY</option>
                <option value="other">{tr("Otro")}</option>
              </select>
            </Field>
            <Field label={tr("Monitor continuo de glucosa (MCG)")}>
              <select className="input" value={form.cgm_device ?? ""} onChange={(e) => setForm({ ...form, cgm_device: e.target.value })}>
                <option value="">—</option>
                <option value="none">{tr("No uso MCG")}</option>
                <option value="libre">FreeStyle Libre</option>
                <option value="dexcom">Dexcom</option>
                <option value="medtronic">Medtronic Guardian</option>
                <option value="eversense">Eversense</option>
                <option value="other">{tr("Otro")}</option>
              </select>
            </Field>
          </div>}
          <p className="text-[11px] text-muted-foreground">{tr("Información orientativa para adaptar recomendaciones. No sustituye el consejo de tu equipo médico.")}</p>
        </Section>
        {profileQ.data?.has_diabetes && <GlucoseLog />}


        <div className="lg:col-span-2 flex justify-end">
          <button type="submit" className="bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-semibold text-sm hover:opacity-90">
            {tr("Guardar cambios")}
          </button>
        </div>
      </form>

      <DeleteAccountSection />
        </TabsContent>
      </Tabs>

      <style>{`.input{width:100%;padding:.55rem .75rem;border-radius:.5rem;border:1px solid var(--border);background:var(--surface);font-size:.875rem;outline:none}.input:focus{box-shadow:0 0 0 2px var(--ring)}`}</style>
    </div>);

}
