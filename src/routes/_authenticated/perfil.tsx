import { tr } from "@/lib/i18n";
import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { syncIntervalsZones, intervalsEstimateFtp, intervalsEstimateHr } from "@/lib/intervals.functions";
import { Wand2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { NotificationsPrefs } from "@/components/NotificationsPrefs";
import { TelegramSection } from "@/components/TelegramSection";
import { Section, Field } from "@/components/perfil/Section";
import { ZonesPreview } from "@/components/perfil/ZonesPreview";
import { DeleteAccountSection } from "@/components/perfil/DeleteAccountSection";
import { IntervalsConnection } from "@/components/perfil/IntervalsConnection";
import { StravaConnection } from "@/components/perfil/StravaConnection";

import { AthleteProfileSection } from "@/components/perfil/AthleteProfileSection";
import { WeatherStatus } from "@/components/perfil/WeatherStatus";
import { COUNTRIES } from "@/lib/countries";




export const Route = createFileRoute("/_authenticated/perfil")({
  component: PerfilPage
});

function PerfilPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const estimateFtp = useServerFn(intervalsEstimateFtp);
  const estimateHr = useServerFn(intervalsEstimateHr);
  const syncZonesIcu = useServerFn(syncIntervalsZones);


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
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("intervals");
    const strava = params.get("strava");
    if (status) {
      if (status === "success") {
        toast.success(tr("¡Cuenta de Intervals.icu conectada correctamente!"));
        qc.invalidateQueries({ queryKey: ["profile"] });
      } else {
        toast.error(tr("No se pudo vincular Intervals.icu"));
      }
    }
    if (strava) {
      if (strava === "success") {
        toast.success(tr("¡Cuenta de Strava conectada correctamente!"));
        qc.invalidateQueries({ queryKey: ["profile"] });
      } else {
        toast.error(tr("No se pudo vincular Strava"));
      }
    }
    if (status || strava) window.history.replaceState({}, "", window.location.pathname);
  }, [qc]);


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
      location_city: form.location_city || null,
      country: form.country || "ES",
      weather_auto_indoor: form.weather_auto_indoor ?? true,
      weather_wind_threshold_kmh: form.weather_wind_threshold_kmh != null && form.weather_wind_threshold_kmh !== "" ? Number(form.weather_wind_threshold_kmh) : 25,
      notify_weather_alerts: form.notify_weather_alerts ?? true,
      // Fuerza volver a localizar si cambia la población o el país
      ...(form.location_city !== profileQ.data?.location_city || (form.country || "ES") !== profileQ.data?.country ?
      { location_lat: null, location_lon: null, location_resolved: null } :
      {}),

      dietary_preferences: form.dietary_preferences,
      readiness_push_enabled: form.readiness_push_enabled ?? true,
      readiness_push_hour: form.readiness_push_hour != null && form.readiness_push_hour !== "" ? Number(form.readiness_push_hour) : 7
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
    }
  };

  const icuConnected = !!profileQ.data?.intervals_api_key;

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{tr("Configuración personal")}</p>
        <h1 className="font-display text-4xl font-bold uppercase tracking-tight">{tr("Tu Perfil")}</h1>
      </div>

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
            <ZonesPreview
              ftp={form.ftp ? Number(form.ftp) : null}
              lthr={form.lthr ? Number(form.lthr) : null}
              maxHr={form.max_hr ? Number(form.max_hr) : null}
              mode={form.zones_display_mode || "watts"}
              onModeChange={(m) => setForm({ ...form, zones_display_mode: m })} />
            
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

        <Section title={tr("Meteorología")}>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tr("Ciudad base para previsión")}>
              <input className="input" placeholder={tr("Madrid, Barcelona, Sevilla…")} value={form.location_city ?? ""} onChange={(e) => setForm({ ...form, location_city: e.target.value })} />
            </Field>
            <Field label={tr("País")}>
              <select className="input" value={form.country ?? "ES"} onChange={(e) => setForm({ ...form, country: e.target.value })}>
                {COUNTRIES.map((c) =>
                <option key={c.code} value={c.code}>{c.name}</option>
                )}
              </select>
            </Field>
          </div>
          <WeatherStatus city={profileQ.data?.location_city} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={tr("Umbral de viento (km/h)")}>
              <input type="number" min={10} max={60} className="input" value={form.weather_wind_threshold_kmh ?? 25} onChange={(e) => setForm({ ...form, weather_wind_threshold_kmh: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm self-end pb-2">
              <input
                type="checkbox"
                checked={form.weather_auto_indoor ?? true}
                onChange={(e) => setForm({ ...form, weather_auto_indoor: e.target.checked })} />
              
              <span>{tr("Sugerir rodillo en mal tiempo")}</span>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.notify_weather_alerts ?? true}
              onChange={(e) => setForm({ ...form, notify_weather_alerts: e.target.checked })} />
            
            <span>{tr("Avisarme cada mañana si hay alerta o mal tiempo")}</span>
          </label>
          <p className="text-[11px] text-muted-foreground">
            {tr("El aviso llega justo después del resumen de la sesión del día, por app y/o Telegram. Incluye los avisos oficiales vigentes (amarillo, naranja o rojo) por lluvias, inundaciones, viento, tormenta o temperaturas extremas, además de la previsión de tu localidad.")}
          </p>
        </Section>

        <Section title={tr("Nutrición")}>
          <Field label={tr("Preferencias / intolerancias")}>
            <textarea className="input min-h-[80px]" placeholder={tr("Vegano, intolerancia lactosa, sin gluten…")} value={form.dietary_preferences ?? ""} onChange={(e) => setForm({ ...form, dietary_preferences: e.target.value })} />
          </Field>
          <p className="text-[11px] text-muted-foreground">{tr("Se tienen en cuenta siempre en el plan semanal y en el plan de competición (se adapta 5 días antes de cada carrera).")}</p>
        </Section>


        <Section title={tr("Conexión Intervals.icu")} className="lg:col-span-2">
          <IntervalsConnection profile={profileQ.data} />
        </Section>

        <Section title={tr("Conexión Strava")} className="lg:col-span-2">
          <StravaConnection profile={profileQ.data} />
        </Section>



        <Section title={tr("Conectar Telegram")} className="lg:col-span-2">
          <TelegramSection />
        </Section>

        <Section title={tr("Notificaciones")} className="lg:col-span-2">
          <NotificationsPrefs />
        </Section>


        <Section title={tr("Readiness diario")} className="lg:col-span-2">
          <p className="text-sm text-muted-foreground"> {tr("Cada día recibirás un Push preguntándote cómo te encuentras (1 Nada preparado · 2 Paseo relajado · 3 Entreno normal · 4 Entreno exigente · 5 Dar lo máximo). La IA adaptará el entrenamiento de ese día según tu respuesta; si respondes 1, te sugerirá eliminarlo.")} 

          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.readiness_push_enabled ?? true}
              onChange={(e) => setForm({ ...form, readiness_push_enabled: e.target.checked })} />
            
            <span>{tr("Recibir Push diario de Readiness")}</span>
          </label>
          <Field label={tr("Hora del Push (Europa / España peninsular)")}>
            <select
              className="input"
              value={form.readiness_push_hour ?? 7}
              onChange={(e) => setForm({ ...form, readiness_push_hour: e.target.value })}>
              
              {Array.from({ length: 24 }, (_, h) =>
              <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
              )}
            </select>
          </Field>
          <p className="text-[11px] text-muted-foreground">
            {tr("Necesitas tener el Push del servidor activado (arriba, en Notificaciones). El aviso solo se envía si aún no has respondido el Readiness del día.")}
          </p>
        </Section>

        <div className="lg:col-span-2 flex justify-end">
          <button type="submit" className="bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-semibold text-sm hover:opacity-90">
            {tr("Guardar cambios")}
          </button>
        </div>
      </form>

      <DeleteAccountSection />

      <style>{`.input{width:100%;padding:.55rem .75rem;border-radius:.5rem;border:1px solid var(--border);background:var(--surface);font-size:.875rem;outline:none}.input:focus{box-shadow:0 0 0 2px var(--ring)}`}</style>
    </div>);

}
