import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Radio, Pause, Play, Square, Siren, Copy, CloudOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { useOnlineStatus } from "@/lib/use-online-status";
import { queuePoint, getQueued, removeQueued, countQueued } from "@/lib/beacon-store";
import { tr } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/baliza")({
  head: () => ({
    meta: [
      { title: "Baliza de seguridad — Globero" },
      { name: "description", content: "Comparte tu posición en tiempo real durante la salida." },
      { property: "og:title", content: "Baliza de seguridad — Globero" },
      { property: "og:description", content: "Comparte tu posición en tiempo real durante la salida." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BeaconPage,
});

type Beacon = { id: string; share_token: string; status: string; expires_at: string; last_seen_at: string | null };
const MIN_INTERVAL_MS = 15000;
const STILL_RADIUS_M = 30;
const STILL_LIMIT_MS = 5 * 60 * 1000;
const STILL_COUNTDOWN_S = 60;
function distM(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function BeaconPage() {
  const { user } = useAuth();
  const online = useOnlineStatus();
  const [beacon, setBeacon] = useState<Beacon | null>(null);
  const [pos, setPos] = useState<GeolocationPosition | null>(null);
  const [pending, setPending] = useState(0);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const watchId = useRef<number | null>(null);
  const lastSaved = useRef(0);
  const flushing = useRef(false);
  const anchor = useRef<{ lat: number; lon: number; t: number } | null>(null);
  const [stillCountdown, setStillCountdown] = useState<number | null>(null);

  // Cargar baliza activa existente
  useEffect(() => {
    if (!user) return;
    supabase.from("safety_beacons").select("id,share_token,status,expires_at,last_seen_at")
      .eq("user_id", user.id).in("status", ["active", "paused", "sos"]).gt("expires_at", new Date().toISOString())
      .order("started_at", { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => data && setBeacon(data));
    countQueued().then(setPending).catch(() => {});
  }, [user]);

  const flush = useCallback(async () => {
    if (flushing.current || !navigator.onLine) return;
    flushing.current = true;
    try {
      const items = await getQueued();
      if (!items.length) return;
      for (let i = 0; i < items.length; i += 200) {
        const chunk = items.slice(i, i + 200);
        const rows = chunk.map(({ key: _k, ...r }) => r);
        const { error } = await supabase.from("beacon_points").insert(rows);
        if (error) throw error;
        await removeQueued(chunk.map((c) => c.key!));
        const last = rows[rows.length - 1];
        let battery: number | null = null;
        try { const b = await (navigator as any).getBattery?.(); if (b) battery = Math.round(b.level * 100); } catch {}
        await supabase.from("safety_beacons").update({ last_lat: last.lat, last_lon: last.lon, last_seen_at: last.recorded_at, ...(battery != null ? { battery_pct: battery } : {}) }).eq("id", last.beacon_id);
      }
    } catch (e) {
      console.warn("[beacon] flush", e);
    } finally {
      flushing.current = false;
      setPending(await countQueued().catch(() => 0));
    }
  }, []);

  useEffect(() => { if (online) flush(); }, [online, flush]);
  useEffect(() => { const t = setInterval(flush, 30000); return () => clearInterval(t); }, [flush]);

  // Captura GPS mientras la baliza está activa o en SOS
  useEffect(() => {
    const capturing = beacon && (beacon.status === "active" || beacon.status === "sos");
    if (!capturing || !user) return;
    if (!("geolocation" in navigator)) { setGpsError(tr("Este dispositivo no tiene GPS disponible.")); return; }
    watchId.current = navigator.geolocation.watchPosition(
      async (p) => {
        setPos(p); setGpsError(null);
        const here = { lat: p.coords.latitude, lon: p.coords.longitude };
        if (!anchor.current || distM(anchor.current, here) > STILL_RADIUS_M) {
          anchor.current = { ...here, t: Date.now() };
          setStillCountdown(null);
        }
        const now = Date.now();
        if (now - lastSaved.current < MIN_INTERVAL_MS) return;
        lastSaved.current = now;
        await queuePoint({
          beacon_id: beacon.id, user_id: user.id, lat: p.coords.latitude, lon: p.coords.longitude,
          altitude_m: p.coords.altitude, speed_kmh: p.coords.speed != null ? p.coords.speed * 3.6 : null,
          heading: p.coords.heading, accuracy_m: p.coords.accuracy, recorded_at: new Date(p.timestamp).toISOString(),
        });
        setPending(await countQueued());
        flush();
      },
      (err) => setGpsError(err.code === 1 ? tr("Permiso de ubicación denegado. Actívalo en el navegador.") : tr("No se puede obtener la ubicación.")),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 },
    );
    let wake: any = null;
    (navigator as any).wakeLock?.request("screen").then((w: any) => (wake = w)).catch(() => {});
    return () => {
      if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current);
      wake?.release?.().catch(() => {});
    };
  }, [beacon, user, flush]);

  const start = async () => {
    if (!user) return;
    const { data, error } = await supabase.from("safety_beacons").insert({ user_id: user.id, name: tr("Salida") })
      .select("id,share_token,status,expires_at,last_seen_at").single();
    if (error) return toast.error(tr("No se pudo iniciar la baliza"));
    lastSaved.current = 0;
    setBeacon(data);
  };

  const setStatus = async (status: "active" | "paused" | "ended" | "sos") => {
    if (!beacon) return;
    await flush();
    const { error } = await supabase.from("safety_beacons")
      .update({ status, ...(status === "ended" ? { ended_at: new Date().toISOString() } : {}) }).eq("id", beacon.id);
    if (error) return toast.error(tr("No se pudo actualizar la baliza"));
    setBeacon(status === "ended" ? null : { ...beacon, status });
    if (status === "sos") toast.warning(tr("SOS activado"));
  };

  // Detección de inmovilidad: sin moverse > 30 m durante 5 min → aviso y SOS automático a los 60 s
  useEffect(() => {
    if (beacon?.status !== "active") { setStillCountdown(null); anchor.current = null; return; }
    const t = setInterval(() => {
      if (anchor.current && stillCountdown == null && Date.now() - anchor.current.t > STILL_LIMIT_MS) {
        setStillCountdown(STILL_COUNTDOWN_S);
        navigator.vibrate?.([400, 200, 400]);
      }
    }, 10000);
    return () => clearInterval(t);
  }, [beacon?.status, stillCountdown]);

  useEffect(() => {
    if (stillCountdown == null) return;
    if (stillCountdown <= 0) { setStillCountdown(null); setStatus("sos"); return; }
    const t = setTimeout(() => setStillCountdown((c) => (c == null ? c : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [stillCountdown]);

  const imOk = () => { anchor.current = anchor.current && { ...anchor.current, t: Date.now() }; setStillCountdown(null); };

  const shareUrl = beacon ? `${window.location.origin}/b/${beacon.share_token}` : "";

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <h1 className="text-2xl font-display font-bold flex items-center gap-2"><Radio className="size-6 text-primary" /> {tr("Baliza de seguridad")}</h1>

      {!online && (
        <div className="flex items-center gap-2 text-sm rounded-lg border border-destructive/40 bg-destructive/10 p-3">
          <CloudOff className="size-4" /> {tr("Sin conexión: las posiciones se guardan en el móvil y se enviarán al recuperar la red.")}
        </div>
      )}

      <Card>
        <CardContent className="p-5 space-y-4">
          {!beacon ? (
            <>
              <p className="text-sm text-muted-foreground">{tr("Activa la baliza antes de salir. Se guardará tu posición cada 15 segundos, también sin cobertura. Mantén esta pantalla abierta.")}</p>
              <Button className="w-full" size="lg" onClick={start}><Play className="size-4" /> {tr("Iniciar baliza")}</Button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-semibold px-2 py-1 rounded ${beacon.status === "sos" ? "bg-destructive text-destructive-foreground" : beacon.status === "paused" ? "bg-muted" : "bg-primary text-primary-foreground"}`}>
                  {beacon.status === "sos" ? "SOS" : beacon.status === "paused" ? tr("Pausada") : tr("Activa")}
                </span>
                <span className="text-xs text-muted-foreground">{tr("Caduca")}: {new Date(beacon.expires_at).toLocaleString()}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <Stat label={tr("Latitud")} value={pos ? pos.coords.latitude.toFixed(5) : "—"} />
                <Stat label={tr("Longitud")} value={pos ? pos.coords.longitude.toFixed(5) : "—"} />
                <Stat label={tr("Precisión")} value={pos ? `${Math.round(pos.coords.accuracy)} m` : "—"} />
                <Stat label={tr("Pendientes de enviar")} value={String(pending)} />
              </div>
              {gpsError && <p className="text-sm text-destructive">{gpsError}</p>}

              <div className="flex gap-2">
                <Input readOnly value={shareUrl} />
                <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(shareUrl); toast.success(tr("Enlace copiado")); }}><Copy className="size-4" /></Button>
              </div>

              <Button asChild className="w-full bg-[#25D366] hover:bg-[#1ebe5b] text-white">
                <a href={`https://wa.me/?text=${encodeURIComponent((beacon.status === "sos" ? tr("¡SOS! Necesito ayuda. Mi posición en directo:") : tr("Sigue mi salida en directo:")) + " " + shareUrl)}`} target="_blank" rel="noopener noreferrer">
                  {tr("Compartir por WhatsApp")}
                </a>
              </Button>

              {stillCountdown != null && (
                <div role="alert" className="rounded-lg border-2 border-destructive bg-destructive/10 p-4 space-y-3 text-center">
                  <p className="font-semibold">{tr("Llevas 5 minutos sin moverte. ¿Estás bien?")}</p>
                  <p className="text-sm text-muted-foreground">{tr("Se activará el SOS en")} {stillCountdown} s</p>
                  <Button className="w-full" size="lg" onClick={imOk}>{tr("Estoy bien")}</Button>
                </div>
              )}

              <div className="grid grid-cols-3 gap-2">
                {beacon.status === "paused"
                  ? <Button variant="outline" onClick={() => setStatus("active")}><Play className="size-4" /> {tr("Reanudar")}</Button>
                  : <Button variant="outline" onClick={() => setStatus("paused")}><Pause className="size-4" /> {tr("Pausar")}</Button>}
                <Button variant="destructive" onClick={() => setStatus(beacon.status === "sos" ? "active" : "sos")}><Siren className="size-4" /> {beacon.status === "sos" ? tr("Cancelar SOS") : "SOS"}</Button>
                <Button variant="secondary" onClick={() => setStatus("ended")}><Square className="size-4" /> {tr("Finalizar")}</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className="flex-1 min-w-0 rounded-md border bg-background px-3 text-xs font-mono" />;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold font-mono">{value}</p>
    </div>
  );
}
