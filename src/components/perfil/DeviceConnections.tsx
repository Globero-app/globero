import { tr } from "@/lib/i18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Link as LinkIcon, Loader2, Unlink } from "lucide-react";
import { claimGarminCode, getGarminDevice, unlinkGarminDevice } from "@/lib/garmin-pairing.functions";
import { createWahooAuthorizeUrl, disconnectWahoo, syncWahooZonesDebug } from "@/lib/wahoo.functions";
import { useAuth } from "@/lib/use-auth";
import { useState } from "react";
import { createGarminAuthorizeUrl, disconnectGarmin, getGarminStatus } from "@/lib/garmin.functions";
import { createHammerheadAuthorizeUrl, disconnectHammerhead } from "@/lib/hammerhead.functions";

export function WahooConnection({ profile }: { profile: any }) {
  const qc = useQueryClient();
  const disconnect = useServerFn(disconnectWahoo);
  const authorize = useServerFn(createWahooAuthorizeUrl);
  const syncDebug = useServerFn(syncWahooZonesDebug);
  const { isAdmin } = useAuth();
  const [debug, setDebug] = useState<{ ok: boolean; status: number; response: string } | null>(null);

  if (profile?.wahoo_access_token) {
    return (
      <>
      <div className="flex items-center justify-between bg-muted border border-border rounded-lg p-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-5 text-primary" />
          <p className="font-semibold">{tr("Wahoo conectado")}</p>
        </div>
        <button
          type="button"
          onClick={async () => {
            await disconnect({ data: undefined });
            toast.success(tr("Wahoo desconectado"));
            qc.invalidateQueries({ queryKey: ["profile"] });
          }}
          className="text-xs font-semibold text-destructive hover:underline flex items-center gap-1"
        >
          <Unlink className="size-3" /> {tr("Desconectar")}
        </button>
      </div>
      {isAdmin && (
        <div className="mt-2 space-y-2">
          <button type="button" className="text-xs font-semibold text-primary hover:underline"
            onClick={async () => { try { setDebug(await syncDebug({ data: undefined })); } catch (e: any) { setDebug({ ok: false, status: 0, response: e.message }); } }}>
            Sincronizar zonas con Wahoo (admin)
          </button>
          {debug && (
            <div className={`text-xs rounded-lg border p-2 ${debug.ok ? "border-primary" : "border-destructive"}`}>
              <p className="font-semibold">{debug.ok ? "OK" : "Error"} · HTTP {debug.status}</p>
              <pre className="whitespace-pre-wrap break-all font-mono text-[10px]">{debug.response || "(sin cuerpo)"}</pre>
            </div>
          )}
        </div>
      )}
      </>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{tr("Conecta tu Wahoo ELEMNT para enviar los entrenamientos al ciclocomputador y recibir tus actividades.")}</p>
      <button
        type="button"
        onClick={async () => {
          try {
            const { url } = await authorize({ data: undefined });
            window.location.href = url;
          } catch (e: any) {
            toast.error(e?.message ?? tr("No se pudo iniciar la conexión"));
          }
        }}
        className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90"
      >
        <LinkIcon className="size-4" /> {tr("Conectar con Wahoo")}
      </button>
    </div>
  );
}

export function GarminConnection({ profile }: { profile?: any }) {
  const qc = useQueryClient();
  const status = useServerFn(getGarminStatus);
  const authorize = useServerFn(createGarminAuthorizeUrl);
  const disconnect = useServerFn(disconnectGarmin);
  const { data } = useQuery({ queryKey: ["garmin-status"], queryFn: () => status() });

  if (profile?.garmin_access_token) {
    return (
      <div className="flex items-center justify-between bg-muted border border-border rounded-lg p-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-5 text-primary" />
          <p className="font-semibold">{tr("Garmin conectado")}</p>
        </div>
        <button
          type="button"
          onClick={async () => {
            await disconnect({ data: undefined });
            toast.success(tr("Garmin desconectado"));
            qc.invalidateQueries({ queryKey: ["profile"] });
          }}
          className="text-xs font-semibold text-destructive hover:underline flex items-center gap-1"
        >
          <Unlink className="size-3" /> {tr("Desconectar")}
        </button>
      </div>
    );
  }

  return <GarminPairing />;
}

function GarminPairing() {
  const qc = useQueryClient();
  const getDev = useServerFn(getGarminDevice);
  const claim = useServerFn(claimGarminCode);
  const unlink = useServerFn(unlinkGarminDevice);
  const { data: device } = useQuery({ queryKey: ["garmin-device"], queryFn: () => getDev() });
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "success" | "expired" | "invalid" | "error">("idle");

  if (device) {
    return (
      <div className="flex items-center justify-between bg-muted border border-border rounded-lg p-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-5 text-primary" />
          <div>
            <p className="font-semibold">{tr("Dispositivo Garmin conectado")}</p>
            <p className="text-xs text-muted-foreground">ID {device.garmin_device_id} · {new Date(device.linked_at).toLocaleDateString()}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await unlink({ data: { id: device.id } });
              toast.success(tr("Dispositivo desvinculado"));
              setCode(""); setState("idle");
              qc.invalidateQueries({ queryKey: ["garmin-device"] });
            } catch { toast.error(tr("No se pudo desvincular")); }
          }}
          className="text-xs font-semibold text-destructive hover:underline flex items-center gap-1"
        >
          <Unlink className="size-3" /> {tr("Desvincular")}
        </button>
      </div>
    );
  }

  const valid = /^[A-Z0-9]{4}$/.test(code);
  const msg: Record<string, { t: string; c: string }> = {
    success: { t: tr("¡Dispositivo vinculado correctamente!"), c: "text-primary" },
    expired: { t: tr("El código ha expirado. Genera uno nuevo en tu Garmin."), c: "text-destructive" },
    invalid: { t: tr("Código incorrecto. Revisa el código de tu Garmin."), c: "text-destructive" },
    error: { t: tr("No se pudo vincular el dispositivo"), c: "text-destructive" },
  };

  const handleClaim = async () => {
    if (!valid || state === "loading") return;
    setState("loading");
    try {
      const r = await claim({ data: { code } });
      if (r.ok) { setState("success"); qc.invalidateQueries({ queryKey: ["garmin-device"] }); }
      else setState(r.reason);
    } catch { setState("error"); }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{tr("Introduce el código de 4 caracteres que aparece en la pantalla de tu Garmin.")}</p>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4)); if (state !== "loading") setState("idle"); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); handleClaim(); } }}
          maxLength={4}
          autoComplete="off"
          placeholder="AB12"
          aria-label={tr("Código de vinculación")}
          className={`w-32 text-center font-mono text-xl tracking-[0.4em] uppercase bg-background border rounded-lg px-3 py-2 ${state === "invalid" || state === "expired" || state === "error" ? "border-destructive" : state === "success" ? "border-primary" : "border-border"}`}
        />
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleClaim(); }}
          disabled={!valid || state === "loading"}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50"
        >
          {state === "loading" ? <Loader2 className="size-4 animate-spin" /> : <LinkIcon className="size-4" />} {tr("Vincular")}
        </button>
      </div>
      {state !== "idle" && state !== "loading" && <p className={`text-sm ${msg[state].c}`}>{msg[state].t}</p>}
    </div>
  );
}

export function HammerheadConnection({ profile }: { profile?: any }) {
  const qc = useQueryClient();
  const authorize = useServerFn(createHammerheadAuthorizeUrl);
  const disconnect = useServerFn(disconnectHammerhead);

  if (profile?.hammerhead_access_token) {
    return (
      <div className="flex items-center justify-between bg-muted border border-border rounded-lg p-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-5 text-primary" />
          <p className="font-semibold">{tr("Hammerhead conectado")}</p>
        </div>
        <button
          type="button"
          onClick={async () => {
            await disconnect({ data: undefined });
            toast.success(tr("Hammerhead desconectado"));
            qc.invalidateQueries({ queryKey: ["profile"] });
          }}
          className="text-xs font-semibold text-destructive hover:underline flex items-center gap-1"
        >
          <Unlink className="size-3" /> {tr("Desconectar")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{tr("Conecta tu Hammerhead Karoo para enviar los entrenamientos al ciclocomputador y recibir tus actividades.")}</p>
      <button
        type="button"
        onClick={async () => {
          try {
            const { url } = await authorize({ data: undefined });
            window.location.href = url;
          } catch (e: any) {
            toast.error(e?.message ?? tr("No se pudo iniciar la conexión"));
          }
        }}
        className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90"
      >
        <LinkIcon className="size-4" /> {tr("Conectar con Hammerhead")}
      </button>
    </div>
  );
}
