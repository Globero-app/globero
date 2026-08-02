import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { stravaExchange, stravaDisconnect, stravaEstimateFtp } from "@/lib/strava.functions";
import { Bike, CheckCircle2, Link as LinkIcon, Unlink, Wrench, Wand2 } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { computePowerZones, computeHrZones } from "@/lib/zones";
import { BikesManager } from "@/components/BikesManager";
import { NotificationsPrefs } from "@/components/NotificationsPrefs";
import { MaintenanceAlertsBanner } from "@/components/MaintenanceAlertsBanner";

export const Route = createFileRoute("/_authenticated/perfil")({
  component: PerfilPage,
});

function PerfilPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const exchange = useServerFn(stravaExchange);
  const disconnect = useServerFn(stravaDisconnect);
  const estimateFtp = useServerFn(stravaEstimateFtp);

  const profileQ = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  const [form, setForm] = useState<any>({});
  useEffect(() => { if (profileQ.data) setForm(profileQ.data); }, [profileQ.data]);

  // Captura ?code=... de Strava
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      exchange({ data: { code } })
        .then(() => { toast.success("Strava conectado"); qc.invalidateQueries(); window.history.replaceState({}, "", "/perfil"); })
        .catch((e) => toast.error(e.message));
    }
  }, [exchange, qc]);

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
      pre_race_days: form.pre_race_days ? Number(form.pre_race_days) : 3,
      nutrition_focus: form.nutrition_focus || "carbohidratos",
      dietary_preferences: form.dietary_preferences,
      strava_client_id: form.strava_client_id,
      strava_client_secret: form.strava_client_secret,
      readiness_push_enabled: form.readiness_push_enabled ?? true,
      readiness_push_hour: form.readiness_push_hour != null && form.readiness_push_hour !== "" ? Number(form.readiness_push_hour) : 7,
    }, { onConflict: "id" });
    if (error) toast.error(error.message);
    else { toast.success("Perfil guardado"); qc.invalidateQueries({ queryKey: ["profile"] }); }
  };

  const connectStrava = async () => {
    await save(new Event("submit") as any);
    if (!form.strava_client_id) { toast.error("Añade tu Client ID de Strava primero"); return; }
    const redirect = `${window.location.origin}/perfil`;
    const url = `https://www.strava.com/oauth/authorize?client_id=${form.strava_client_id}&response_type=code&redirect_uri=${encodeURIComponent(redirect)}&approval_prompt=auto&scope=read,activity:read_all,profile:read_all`;
    // Strava bloquea el login dentro de iframes (cookies de terceros).
    // Si estamos embebidos (p.ej. preview de Lovable), forzamos la ventana superior;
    // si no es posible, abrimos en pestaña nueva.
    const inIframe = typeof window !== "undefined" && window.self !== window.top;
    if (inIframe) {
      try {
        window.top!.location.href = url;
        return;
      } catch {
        window.open(url, "_blank", "noopener,noreferrer");
        toast.info("Abre Strava en la pestaña nueva para completar la conexión.");
        return;
      }
    }
    window.location.href = url;
  };

  const handleDisconnect = async () => {
    await disconnect({ data: undefined });
    toast.success("Strava desconectado");
    qc.invalidateQueries({ queryKey: ["profile"] });
  };

  const stravaConnected = !!profileQ.data?.strava_access_token;

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Configuración personal</p>
        <h1 className="font-display text-4xl font-bold uppercase tracking-tight">Tu Perfil</h1>
      </div>

      <form onSubmit={save} className="grid lg:grid-cols-2 gap-6">
        <Section title="Datos personales">
          <Field label="Nombre completo"><input className="input" value={form.full_name ?? ""} onChange={(e) => setForm({...form, full_name: e.target.value})} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Edad"><input type="number" className="input" value={form.age ?? ""} onChange={(e) => setForm({...form, age: e.target.value})} /></Field>
            <Field label="Sexo">
              <select className="input" value={form.gender ?? ""} onChange={(e) => setForm({...form, gender: e.target.value})}>
                <option value="">—</option><option value="masculino">Masculino</option><option value="femenino">Femenino</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Peso (kg)"><input type="number" step="0.1" className="input" value={form.weight_kg ?? ""} onChange={(e) => setForm({...form, weight_kg: e.target.value})} /></Field>
            <Field label="Altura (cm)"><input type="number" className="input" value={form.height_cm ?? ""} onChange={(e) => setForm({...form, height_cm: e.target.value})} /></Field>
          </div>
          <Field label="FTP (W)">
            <div className="flex gap-2">
              <input type="number" className="input" value={form.ftp ?? ""} onChange={(e) => setForm({...form, ftp: e.target.value})} />
              {!!profileQ.data?.strava_access_token && (
                <button
                  type="button"
                  title="Estimar FTP automáticamente desde tus actividades de Strava"
                  onClick={async () => {
                    try {
                      const r = await estimateFtp({ data: undefined });
                      setForm((f: any) => ({ ...f, ftp: r.ftp }));
                      toast.success(`FTP estimado: ${r.ftp} W`);
                      qc.invalidateQueries({ queryKey: ["profile"] });
                    } catch (e: any) { toast.error(e.message); }
                  }}
                  className="shrink-0 inline-flex items-center gap-1 px-3 rounded-lg border bg-surface text-xs font-semibold hover:bg-muted"
                >
                  <Wand2 className="size-3.5" /> Auto
                </button>
              )}
            </div>
            {!!profileQ.data?.strava_access_token && (
              <p className="mt-1 text-[10px] text-muted-foreground">Se calcula desde tus actividades Strava con potencia. Puedes modificarlo manualmente.</p>
            )}
            <div className="mt-2">
              <Link to="/ftp-test" className="text-xs font-semibold text-primary hover:underline">
                ¿No conoces tu FTP? Hacer el test guiado de 20 min →
              </Link>
            </div>
            <ZonesPreview
              ftp={form.ftp ? Number(form.ftp) : null}
              lthr={form.lthr ? Number(form.lthr) : null}
              maxHr={form.max_hr ? Number(form.max_hr) : null}
              mode={form.zones_display_mode || "watts"}
              onModeChange={(m) => setForm({ ...form, zones_display_mode: m })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="FC máx (bpm)">
              <div className="flex gap-2">
                <input type="number" className="input" value={form.max_hr ?? ""} onChange={(e) => setForm({ ...form, max_hr: e.target.value })} />
                {!!profileQ.data?.strava_access_token && (
                  <button
                    type="button"
                    title="Estimar FC máx y LTHR desde tus actividades de Strava"
                    onClick={async () => {
                      try {
                        const r = await estimateHr({ data: undefined });
                        setForm((f: any) => ({ ...f, max_hr: r.max_hr ?? f.max_hr, lthr: r.lthr ?? f.lthr }));
                        toast.success(`FC máx: ${r.max_hr ?? "—"} bpm · LTHR: ${r.lthr ?? "—"} bpm`);
                        qc.invalidateQueries({ queryKey: ["profile"] });
                      } catch (e: any) { toast.error(e.message); }
                    }}
                    className="shrink-0 inline-flex items-center gap-1 px-3 rounded-lg border bg-surface text-xs font-semibold hover:bg-muted"
                  >
                    <Wand2 className="size-3.5" /> Auto
                  </button>
                )}
              </div>
            </Field>
            <Field label="Umbral FC / LTHR (bpm)">
              <input type="number" className="input" placeholder="≈ 92% FCmáx" value={form.lthr ?? ""} onChange={(e) => setForm({ ...form, lthr: e.target.value })} />
            </Field>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {profileQ.data?.strava_access_token
              ? "Se calculan automáticamente desde tus actividades Strava con pulsómetro (FC máx registrada y LTHR = mejor FC media de 20' × 0,95). Puedes modificarlos manualmente."
              : "LTHR = FC media del último 20' del test FTP × 0,95. Si no lo indicas, se estima como 92 % de tu FC máx."}
          </p>
        </Section>

        <Section title="Plan nutricional">
          <Field label="Días previos para Menú Pre-Carrera (1-5)">
            <input type="number" min={1} max={5} className="input" value={form.pre_race_days ?? 3} onChange={(e) => setForm({...form, pre_race_days: e.target.value})} />
          </Field>
          <Field label="Enfoque">
            <select className="input" value={form.nutrition_focus ?? "carbohidratos"} onChange={(e) => setForm({...form, nutrition_focus: e.target.value})}>
              <option value="carbohidratos">Carbohidratos</option>
              <option value="calorias">Calorías totales</option>
              <option value="macros">Macronutrientes</option>
            </select>
          </Field>
          <Field label="Preferencias / intolerancias">
            <textarea className="input min-h-[80px]" placeholder="Vegano, intolerancia lactosa, sin gluten…" value={form.dietary_preferences ?? ""} onChange={(e) => setForm({...form, dietary_preferences: e.target.value})} />
          </Field>
        </Section>

        <Section title="Conexión Strava" className="lg:col-span-2">
          {stravaConnected ? (
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="size-5 text-emerald-600" />
                <div>
                  <p className="font-semibold text-emerald-800">Strava conectado</p>
                  <p className="text-xs text-emerald-700">Athlete ID: {profileQ.data?.strava_athlete_id}</p>
                </div>
              </div>
              <button type="button" onClick={handleDisconnect} className="text-xs font-semibold text-destructive hover:underline flex items-center gap-1">
                <Unlink className="size-3" /> Desconectar
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Necesitas una app propia en <a className="underline text-primary" href="https://www.strava.com/settings/api" target="_blank" rel="noopener">Strava Developers</a>.
                Como Authorization Callback Domain pon: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{typeof window !== "undefined" ? window.location.hostname : "tu-dominio"}</code>
              </p>
              <div className="grid md:grid-cols-2 gap-3">
                <Field label="Client ID"><input className="input" value={form.strava_client_id ?? ""} onChange={(e) => setForm({...form, strava_client_id: e.target.value})} /></Field>
                <Field label="Client Secret"><input type="password" className="input" value={form.strava_client_secret ?? ""} onChange={(e) => setForm({...form, strava_client_secret: e.target.value})} /></Field>
              </div>
              <button type="button" onClick={connectStrava} className="inline-flex items-center gap-2 bg-[#fc4c02] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90">
                <Bike className="size-4" /> Conectar con Strava
              </button>
            </div>
          )}
        </Section>

        <Section title="Material y mantenimiento" className="lg:col-span-2">
          <MaintenanceAlertsBanner variant="inline" />
          <NotificationsPrefs />
          <BikesManager />
        </Section>

        <Section title="Readiness diario" className="lg:col-span-2">
          <p className="text-sm text-muted-foreground">
            Cada día recibirás un Push preguntándote cómo te encuentras (1 Nada preparado · 2 Paseo relajado · 3 Entreno normal · 4 Entreno exigente · 5 Dar lo máximo). La IA adaptará el entrenamiento de ese día según tu respuesta; si respondes 1, te sugerirá eliminarlo.
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.readiness_push_enabled ?? true}
              onChange={(e) => setForm({ ...form, readiness_push_enabled: e.target.checked })}
            />
            <span>Recibir Push diario de Readiness</span>
          </label>
          <Field label="Hora del Push (Europa / España peninsular)">
            <select
              className="input"
              value={form.readiness_push_hour ?? 7}
              onChange={(e) => setForm({ ...form, readiness_push_hour: e.target.value })}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
              ))}
            </select>
          </Field>
          <p className="text-[11px] text-muted-foreground">
            Necesitas tener el Push del servidor activado (arriba, en Notificaciones). El aviso solo se envía si aún no has respondido el Readiness del día.
          </p>
        </Section>

        <div className="lg:col-span-2 flex justify-end">
          <button type="submit" className="bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-semibold text-sm hover:opacity-90">
            Guardar cambios
          </button>
        </div>
      </form>

      <style>{`.input{width:100%;padding:.55rem .75rem;border-radius:.5rem;border:1px solid var(--border);background:var(--surface);font-size:.875rem;outline:none}.input:focus{box-shadow:0 0 0 2px var(--ring)}`}</style>
    </div>
  );
}

function Section({ title, children, className = "" }: any) {
  return (
    <div className={`bg-surface border rounded-xl p-5 space-y-3 ${className}`}>
      <h3 className="font-display text-lg font-bold uppercase tracking-tight">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
function Field({ label, children }: any) {
  return <label className="block"><span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</span><div className="mt-1">{children}</div></label>;
}

function ZonesPreview({
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
