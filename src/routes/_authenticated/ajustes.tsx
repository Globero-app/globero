import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { User, Link2, Bell, SlidersHorizontal, Lock, LogOut, ChevronRight, ArrowLeft } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { tr, LanguageSelector } from "@/lib/i18n";
import { toast } from "sonner";
import { NotificationsPrefs } from "@/components/NotificationsPrefs";
import { TelegramSection } from "@/components/TelegramSection";
import { Section, Field } from "@/components/perfil/Section";
import { IntervalsConnection } from "@/components/perfil/IntervalsConnection";
import { StravaConnection } from "@/components/perfil/StravaConnection";
import { WahooConnection, GarminConnection, HammerheadConnection } from "@/components/perfil/DeviceConnections";
import { createHammerheadAuthorizeUrl, disconnectHammerhead } from "@/lib/hammerhead.functions";
import { WeatherStatus } from "@/components/perfil/WeatherStatus";
import { COUNTRIES } from "@/lib/countries";
import { CityAutocomplete } from "@/components/perfil/CityAutocomplete";

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
  const authorizeHammerhead = useServerFn(createHammerheadAuthorizeUrl);
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
  const router = useRouter();
  const [view, setView] = useState<"menu" | "conexiones" | "notificaciones" | "aplicacion">(() => {
    if (typeof window === "undefined") return "menu";
    const p = new URLSearchParams(window.location.search);
    return ["intervals", "strava", "wahoo", "hammerhead", "garmin", "conectar"].some((k) => p.has(k)) ? "conexiones" : "menu";
  });
  const signOut = async () => { qc.clear(); await supabase.auth.signOut(); router.navigate({ to: "/auth", replace: true }); };
  const titles = { menu: tr("Ajustes"), conexiones: tr("Conexiones"), notificaciones: tr("Notificaciones"), aplicacion: tr("Aplicación") };

  useEffect(() => { if (profileQ.data) setForm(profileQ.data); }, [profileQ.data]);
  useEffect(() => {
    if (!user?.id) return;
    const conectar = new URLSearchParams(window.location.search).get("conectar");
    if (conectar !== "hammerhead") return;
    window.history.replaceState({}, "", window.location.pathname);
    authorizeHammerhead({ data: undefined })
      .then(({ url }) => { window.location.href = url; })
      .catch((e: any) => toast.error(e?.message ?? tr("No se pudo iniciar la conexión")));
  }, [user?.id, authorizeHammerhead]);
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
    const hammerhead = params.get("hammerhead");
    if (hammerhead) {
      toast[hammerhead === "success" ? "success" : "error"](
        tr(hammerhead === "success" ? "¡Cuenta de Hammerhead conectada correctamente!" : "No se pudo vincular Hammerhead"),
      );
      qc.invalidateQueries({ queryKey: ["profile"] });
    }
    const garmin = params.get("garmin");
    if (garmin) {
      toast[garmin === "success" ? "success" : "error"](
        tr(garmin === "success" ? "¡Cuenta de Garmin conectada correctamente!" : "No se pudo vincular Garmin"),
      );
    }
    if (intervals || strava || wahoo || garmin || hammerhead) window.history.replaceState({}, "", window.location.pathname);
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
      ...(form._pick && form._pick.city === form.location_city
        ? { location_lat: form._pick.lat, location_lon: form._pick.lon, location_resolved: `${form._pick.city}|${form._pick.label}` }
        : form.location_city !== profileQ.data?.location_city || (form.country || "ES") !== profileQ.data?.country
        ? { location_lat: null, location_lon: null, location_resolved: null }
        : {}),
    }).eq("id", user.id);
    if (error) toast.error(error.message);
    else {
      toast.success(tr("Ajustes guardados"));
      qc.invalidateQueries({ queryKey: ["profile"] });
    }
  };

  const Row = ({ icon: Icon, label, onClick, to, danger }: { icon: any; label: string; onClick?: () => void; to?: string; danger?: boolean }) => {
    const cls = `flex w-full min-w-0 items-center gap-4 px-5 py-4 text-left hover:bg-secondary/60 ${danger ? "text-destructive" : ""}`;
    const inner = (<><Icon className="size-5 shrink-0" /><span className="min-w-0 flex-1 truncate text-base">{label}</span>{!danger && <ChevronRight className="size-5 shrink-0 text-muted-foreground" />}</>);
    return to ? <Link to={to as any} className={cls}>{inner}</Link> : <button type="button" onClick={onClick} className={cls}>{inner}</button>;
  };

  return (
    <div className="w-full min-w-0 max-w-2xl space-y-6">
      <div className="flex min-w-0 items-center gap-3">
        {view !== "menu" && <button type="button" onClick={() => setView("menu")} aria-label={tr("Volver")} className="p-2 -ml-2 rounded-md hover:bg-secondary shrink-0"><ArrowLeft className="size-5" /></button>}
        <h1 className="font-display text-3xl font-bold uppercase tracking-tight truncate">{titles[view]}</h1>
      </div>

      {view === "menu" && (
        <>
          <div className="rounded-2xl bg-muted divide-y divide-border overflow-hidden">
            <Row icon={User} label={tr("Cuenta")} to="/perfil" />
            <Row icon={Link2} label={tr("Conexiones")} onClick={() => setView("conexiones")} />
            <Row icon={Bell} label={tr("Notificaciones")} onClick={() => setView("notificaciones")} />
            <Row icon={SlidersHorizontal} label={tr("Aplicación")} onClick={() => setView("aplicacion")} />
            <Row icon={Lock} label={tr("Privacidad")} to="/privacidad" />
            <Row icon={LogOut} label={tr("Cerrar sesión")} onClick={signOut} danger />
          </div>
          <p className="text-xs text-muted-foreground break-all">{user?.email}</p>
        </>
      )}

      {view === "conexiones" && (
        <div className="space-y-4">
          <ConnCard name="Garmin Connect" letter="G" desc={tr("Envía entrenamientos a tu Garmin y recibe tus actividades.")} connected={!!profileQ.data?.garmin_access_token}><GarminConnection profile={profileQ.data} /></ConnCard>
          <ConnCard name="Wahoo" letter="W" desc={tr("Sincroniza entrenamientos y actividades con tu Wahoo ELEMNT.")} connected={!!profileQ.data?.wahoo_access_token}><WahooConnection profile={profileQ.data} /></ConnCard>
          <ConnCard name="Hammerhead" letter="H" desc={tr("Sincroniza entrenamientos y actividades con tu Karoo.")} connected={!!profileQ.data?.hammerhead_access_token}><HammerheadConnection profile={profileQ.data} /></ConnCard>
          <ConnCard name="Intervals.icu" letter="i" desc={tr("Calendario, actividades, wellness y carga de entrenamiento.")} connected={!!profileQ.data?.intervals_api_key}><IntervalsConnection profile={profileQ.data} /></ConnCard>
          <ConnCard name="Strava" letter="S" desc={tr("Importa tus actividades y renombra las salidas detectadas.")} connected={!!profileQ.data?.strava_access_token}><StravaConnection profile={profileQ.data} /></ConnCard>
        </div>
      )}

      {(view === "notificaciones" || view === "aplicacion") && (
      <form onSubmit={save} className="grid min-w-0 grid-cols-1 gap-4 sm:gap-6 [&>*]:min-w-0 [&_input]:min-w-0 [&_select]:min-w-0 [&_select]:max-w-full [&_p]:break-words">
        {view === "aplicacion" && (<>
        <Section title={tr("Idioma")}>
          <Field label={tr("Idioma de la aplicación")}>
            <LanguageSelector className="w-full !text-sm !py-2.5" />
          </Field>
        </Section>

        <Section title={tr("Meteorología")}>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={tr("Ciudad base para previsión")}>
              <CityAutocomplete placeholder={tr("Madrid, Barcelona, Sevilla…")} value={form.location_city ?? ""}
                onChange={(v) => setForm((f: any) => ({ ...f, location_city: v, _pick: null }))}
                onPick={(p) => setForm((f: any) => ({ ...f, location_city: p.city, country: COUNTRIES.some((c) => c.code === p.country) ? p.country : f.country, _pick: p }))} />
              {form._pick && <p className="text-[11px] text-muted-foreground mt-1">{form._pick.label} · {form._pick.lat.toFixed(4)}, {form._pick.lon.toFixed(4)}</p>}
            </Field>
            <Field label={tr("País")}>
              <select className="input" value={form.country ?? "ES"} onChange={(e) => setForm({ ...form, country: e.target.value })}>
                {COUNTRIES.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
              </select>
            </Field>
          </div>
          <WeatherStatus city={profileQ.data?.location_city} />
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label={tr("Umbral de viento (km/h)")}>
              <input type="number" min={10} max={60} className="input" value={form.weather_wind_threshold_kmh ?? 25} onChange={(e) => setForm({ ...form, weather_wind_threshold_kmh: e.target.value })} />
            </Field>
            <label className="flex min-w-0 items-start gap-2 text-sm self-end pb-2">
              <input type="checkbox" className="mt-1 shrink-0" checked={form.weather_auto_indoor ?? true} onChange={(e) => setForm({ ...form, weather_auto_indoor: e.target.checked })} />
              <span>{tr("Sugerir rodillo en mal tiempo")}</span>
            </label>
          </div>
          <label className="flex min-w-0 items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 shrink-0" checked={form.notify_weather_alerts ?? true} onChange={(e) => setForm({ ...form, notify_weather_alerts: e.target.checked })} />
            <span>{tr("Avisarme cada mañana si hay alerta o mal tiempo")}</span>
          </label>
          <p className="text-[11px] text-muted-foreground">{tr("El aviso llega justo después del resumen de la sesión del día, por app y/o Telegram. Incluye los avisos oficiales vigentes (amarillo, naranja o rojo) por lluvias, inundaciones, viento, tormenta o temperaturas extremas, además de la previsión de tu localidad.")}</p>
        </Section>

        </>)}
        {view === "notificaciones" && (<>
        <Section title={tr("Conexión Telegram")} className="lg:col-span-2">
          <TelegramSection />
        </Section>
        <Section title={tr("Notificaciones")} className="lg:col-span-2">
          <NotificationsPrefs />
        </Section>
        <Section title={tr("Readiness diario")} className="lg:col-span-2">
          <p className="text-sm text-muted-foreground">{tr("Cada día recibirás un Push preguntándote cómo te encuentras (1 Nada preparado · 2 Paseo relajado · 3 Entreno normal · 4 Entreno exigente · 5 Dar lo máximo). La IA adaptará el entrenamiento de ese día según tu respuesta; si respondes 1, te sugerirá eliminarlo.")}</p>
          <label className="flex min-w-0 items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1 shrink-0" checked={form.readiness_push_enabled ?? true} onChange={(e) => setForm({ ...form, readiness_push_enabled: e.target.checked })} />
            <span>{tr("Recibir Push diario de Readiness")}</span>
          </label>
          <Field label={tr("Hora del Push (Europa / España peninsular)")}>
            <select className="input" value={form.readiness_push_hour ?? 7} onChange={(e) => setForm({ ...form, readiness_push_hour: e.target.value })}>
              {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00</option>)}
            </select>
          </Field>
          <p className="text-[11px] text-muted-foreground">{tr("Necesitas tener el Push del servidor activado (arriba, en Notificaciones). El aviso solo se envía si aún no has respondido el Readiness del día.")}</p>
        </Section>

        </>)}
        <div className="flex justify-end">
          <button type="submit" className="bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-semibold text-sm hover:opacity-90">{tr("Guardar ajustes")}</button>
        </div>
      </form>
      )}
      <style>{`.input{width:100%;padding:.55rem .75rem;border-radius:.5rem;border:1px solid var(--border);background:var(--surface);font-size:.875rem;outline:none}.input:focus{box-shadow:0 0 0 2px var(--ring)}`}</style>
    </div>
  );
}


function ConnCard({ name, letter, desc, connected, children }: { name: string; letter: string; desc: string; connected: boolean; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-muted p-4 sm:p-5 space-y-3 min-w-0">
      <div className="flex min-w-0 items-center gap-3">
        <div className="size-11 shrink-0 rounded-xl bg-primary text-primary-foreground grid place-items-center font-display text-lg font-bold">{letter}</div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold truncate">{name}</p>
          <p className="text-xs text-muted-foreground">{connected ? tr("Conectado") : tr("No conectado")} · {desc}</p>
        </div>
      </div>
      <div className="min-w-0 [&_p]:break-words">{children}</div>
    </div>
  );
}
