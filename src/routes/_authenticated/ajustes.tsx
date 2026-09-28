import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { tr, LanguageSelector } from "@/lib/i18n";
import { toast } from "sonner";
import { NotificationsPrefs } from "@/components/NotificationsPrefs";
import { TelegramSection } from "@/components/TelegramSection";
import { Section, Field } from "@/components/perfil/Section";
import { IntervalsConnection } from "@/components/perfil/IntervalsConnection";
import { StravaConnection } from "@/components/perfil/StravaConnection";
import { WahooConnection, GarminConnection } from "@/components/perfil/DeviceConnections";
import { WeatherStatus } from "@/components/perfil/WeatherStatus";
import { COUNTRIES } from "@/lib/countries";

export const Route = createFileRoute("/_authenticated/ajustes")({
  head: () => ({
    meta: [
      { title: "Ajustes — Globero" },
      { name: "description", content: "Configura el idioma, la meteorología, las conexiones y las notificaciones de Globero." },
      { property: "og:title", content: "Ajustes — Globero" },
      { property: "og:description", content: "Configura el idioma, la meteorología, las conexiones y las notificaciones de Globero." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AjustesPage,
});

function AjustesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const profileQ = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });
  const [form, setForm] = useState<any>({});

  useEffect(() => { if (profileQ.data) setForm(profileQ.data); }, [profileQ.data]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const intervals = params.get("intervals");
    const strava = params.get("strava");
    const wahoo = params.get("wahoo");
    if (intervals) {
      toast[intervals === "success" ? "success" : "error"](
        tr(intervals === "success" ? "¡Cuenta de Intervals.icu conectada correctamente!" : "No se pudo vincular Intervals.icu"),
      );
      qc.invalidateQueries({ queryKey: ["profile"] });
    }
    if (strava) {
      toast[strava === "success" ? "success" : "error"](
        tr(strava === "success" ? "¡Cuenta de Strava conectada correctamente!" : "No se pudo vincular Strava"),
      );
      qc.invalidateQueries({ queryKey: ["profile"] });
    }
    if (wahoo) {
      toast[wahoo === "success" ? "success" : "error"](
        tr(wahoo === "success" ? "¡Cuenta de Wahoo conectada correctamente!" : "No se pudo vincular Wahoo"),
      );
      qc.invalidateQueries({ queryKey: ["profile"] });
    }
    const garmin = params.get("garmin");
    if (garmin) {
      toast[garmin === "success" ? "success" : "error"](
        tr(garmin === "success" ? "¡Cuenta de Garmin conectada correctamente!" : "No se pudo vincular Garmin"),
      );
    }
    if (intervals || strava || wahoo || garmin) window.history.replaceState({}, "", window.location.pathname);
  }, [qc]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!user?.id) return;
    const { error } = await supabase.from("profiles").update({
      location_city: form.location_city || null,
      country: form.country || "ES",
      weather_auto_indoor: form.weather_auto_indoor ?? true,
      weather_wind_threshold_kmh: form.weather_wind_threshold_kmh !== "" ? Number(form.weather_wind_threshold_kmh ?? 25) : 25,
      notify_weather_alerts: form.notify_weather_alerts ?? true,
      readiness_push_enabled: form.readiness_push_enabled ?? true,
      readiness_push_hour: form.readiness_push_hour !== "" ? Number(form.readiness_push_hour ?? 7) : 7,
      ...(form.location_city !== profileQ.data?.location_city || (form.country || "ES") !== profileQ.data?.country
        ? { location_lat: null, location_lon: null, location_resolved: null }
        : {}),
    }).eq("id", user.id);
    if (error) toast.error(error.message);
    else {
      toast.success(tr("Ajustes guardados"));
      qc.invalidateQueries({ queryKey: ["profile"] });
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{tr("Preferencias y conexiones")}</p>
        <h1 className="font-display text-4xl font-bold uppercase tracking-tight">{tr("Ajustes")}</h1>
      </div>

      <form onSubmit={save} className="grid lg:grid-cols-2 gap-6">
        <Section title={tr("Idioma")}>
          <Field label={tr("Idioma de la aplicación")}>
            <LanguageSelector className="w-full !text-sm !py-2.5" />
          </Field>
        </Section>

        <Section title={tr("Meteorología")}>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tr("Ciudad base para previsión")}>
              <input className="input" placeholder={tr("Madrid, Barcelona, Sevilla…")} value={form.location_city ?? ""} onChange={(e) => setForm({ ...form, location_city: e.target.value })} />
            </Field>
            <Field label={tr("País")}>
              <select className="input" value={form.country ?? "ES"} onChange={(e) => setForm({ ...form, country: e.target.value })}>
                {COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
              </select>
            </Field>
          </div>
          <WeatherStatus city={profileQ.data?.location_city} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={tr("Umbral de viento (km/h)")}>
              <input type="number" min={10} max={60} className="input" value={form.weather_wind_threshold_kmh ?? 25} onChange={(e) => setForm({ ...form, weather_wind_threshold_kmh: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 text-sm self-end pb-2">
              <input type="checkbox" checked={form.weather_auto_indoor ?? true} onChange={(e) => setForm({ ...form, weather_auto_indoor: e.target.checked })} />
              <span>{tr("Sugerir rodillo en mal tiempo")}</span>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.notify_weather_alerts ?? true} onChange={(e) => setForm({ ...form, notify_weather_alerts: e.target.checked })} />
            <span>{tr("Avisarme cada mañana si hay alerta o mal tiempo")}</span>
          </label>
          <p className="text-[11px] text-muted-foreground">{tr("El aviso llega justo después del resumen de la sesión del día, por app y/o Telegram. Incluye los avisos oficiales vigentes (amarillo, naranja o rojo) por lluvias, inundaciones, viento, tormenta o temperaturas extremas, además de la previsión de tu localidad.")}</p>
        </Section>

        <Section title={tr("Conexión Intervals.icu")} className="lg:col-span-2">
          <IntervalsConnection profile={profileQ.data} />
        </Section>
        <Section title={tr("Conexión Strava")} className="lg:col-span-2">
          <StravaConnection profile={profileQ.data} />
        </Section>
        <Section title={tr("Conexión Wahoo ELEMNT")}>
          <WahooConnection profile={profileQ.data} />
        </Section>
        <Section title={tr("Conexión Garmin Connect")}>
          <GarminConnection profile={profile} />
        </Section>
        <Section title={tr("Conexión Telegram")} className="lg:col-span-2">
          <TelegramSection />
        </Section>
        <Section title={tr("Notificaciones")} className="lg:col-span-2">
          <NotificationsPrefs />
        </Section>
        <Section title={tr("Readiness diario")} className="lg:col-span-2">
          <p className="text-sm text-muted-foreground">{tr("Cada día recibirás un Push preguntándote cómo te encuentras (1 Nada preparado · 2 Paseo relajado · 3 Entreno normal · 4 Entreno exigente · 5 Dar lo máximo). La IA adaptará el entrenamiento de ese día según tu respuesta; si respondes 1, te sugerirá eliminarlo.")}</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.readiness_push_enabled ?? true} onChange={(e) => setForm({ ...form, readiness_push_enabled: e.target.checked })} />
            <span>{tr("Recibir Push diario de Readiness")}</span>
          </label>
          <Field label={tr("Hora del Push (Europa / España peninsular)")}>
            <select className="input" value={form.readiness_push_hour ?? 7} onChange={(e) => setForm({ ...form, readiness_push_hour: e.target.value })}>
              {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}
            </select>
          </Field>
          <p className="text-[11px] text-muted-foreground">{tr("Necesitas tener el Push del servidor activado (arriba, en Notificaciones). El aviso solo se envía si aún no has respondido el Readiness del día.")}</p>
        </Section>

        <div className="lg:col-span-2 flex justify-end">
          <button type="submit" className="bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-semibold text-sm hover:opacity-90">{tr("Guardar ajustes")}</button>
        </div>
      </form>
      <style>{`.input{width:100%;padding:.55rem .75rem;border-radius:.5rem;border:1px solid var(--border);background:var(--surface);font-size:.875rem;outline:none}.input:focus{box-shadow:0 0 0 2px var(--ring)}`}</style>
    </div>
  );
}
