import { tr } from "@/lib/i18n";import { useEffect, useState } from "react";
import { Download, Share, Plus, X, Smartphone } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const APK_URL = import.meta.env.VITE_ANDROID_APK_URL || "https://github.com/Globero-app/globero/releases/latest/download/globero.apk";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{outcome: "accepted" | "dismissed";}>;
};

function detectPlatform(): "ios" | "android" | "desktop" | "other" {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/(Windows|Mac|Linux)/i.test(ua)) return "desktop";
  return "other";
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (window.navigator as unknown as {standalone?: boolean;}).standalone === true);

}

function isInIframe(): boolean {
  try {return window.self !== window.top;} catch {return true;}
}

export function InstallAppButton({ variant = "menu" }: {variant?: "menu" | "compact";}) {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(false);
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop" | "other">("other");
  const [embedded, setEmbedded] = useState(false);

  useEffect(() => {
    setPlatform(detectPlatform());
    setInstalled(isStandalone());
    setEmbedded(isInIframe());
    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => {setInstalled(true);setDeferred(null);};
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  const handleClick = async () => {
    if (deferred && platform !== "android") {
      await deferred.prompt();
      await deferred.userChoice.catch(() => null);
      setDeferred(null);
      return;
    }
    setOpen(true);
  };

  const label = "Instalar app";

  return (
    <>
      {variant === "menu" ?
      <button
        onClick={handleClick}
        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-primary hover:bg-primary/10 transition-colors">
        
          <Download className="size-4 shrink-0" />
          {label}
        </button> :

      <button
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
        
          <Download className="size-3.5" /> {label}
        </button>
      }

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="size-5 text-primary" /> {tr("Instalar Globero")} 
            </DialogTitle>
            <DialogDescription> {tr("Añade la app a tu pantalla de inicio para abrirla como una aplicación nativa, con acceso offline.")} 

            </DialogDescription>
          </DialogHeader>

          {embedded &&
          <div className="text-xs rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-200 p-3"> {tr("Estás viendo la app dentro del editor. Para instalarla, abre la URL publicada directamente en el navegador de tu móvil:")} 

            <br />
              <a className="underline font-medium" href="https://coach.globero.app" target="_blank" rel="noreferrer"> {tr("globero.app")} 

            </a>
            </div>
          }

          {platform === "ios" &&
          <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="size-6 rounded-full bg-primary/15 text-primary grid place-items-center text-xs font-bold shrink-0">1</span>
                <span>{tr("Abre esta web en")} <strong>{tr("Safari")}</strong> {tr("(no funciona en Chrome iOS).")}</span>
              </li>
              <li className="flex gap-3">
                <span className="size-6 rounded-full bg-primary/15 text-primary grid place-items-center text-xs font-bold shrink-0">2</span>
                <span className="flex items-center gap-1.5">{tr("Toca el botón")} <Share className="size-4 inline" /> <strong>{tr("Compartir")}</strong> {tr("en la barra inferior.")}</span>
              </li>
              <li className="flex gap-3">
                <span className="size-6 rounded-full bg-primary/15 text-primary grid place-items-center text-xs font-bold shrink-0">3</span>
                <span className="flex items-center gap-1.5">{tr("Elige")} <Plus className="size-4 inline" /> <strong>{tr("Añadir a pantalla de inicio")}</strong> {tr("y confirma.")}</span>
              </li>
            </ol>
          }

          {platform === "android" &&
          <a href={APK_URL} download className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90">
              <Download className="size-4" /> {tr("Descargar app Android (APK)")}
            </a>
          }
          {platform === "android" &&
          <p className="text-xs text-muted-foreground">{tr("Recomendado: la app Android mantiene la baliza activa con la pantalla apagada. Al instalar, permite «orígenes desconocidos». Alternativa sin APK:")}</p>
          }
          {platform === "android" &&
          <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="size-6 rounded-full bg-primary/15 text-primary grid place-items-center text-xs font-bold shrink-0">1</span>
                <span>{tr("Abre el menú")} <strong>⋮</strong> {tr("de Chrome o Edge.")}</span>
              </li>
              <li className="flex gap-3">
                <span className="size-6 rounded-full bg-primary/15 text-primary grid place-items-center text-xs font-bold shrink-0">2</span>
                <span>{tr("Toca")} <strong>{tr("Instalar aplicación")}</strong> {tr("o")} <strong>{tr("Añadir a pantalla de inicio")}</strong>.</span>
              </li>
              <li className="flex gap-3">
                <span className="size-6 rounded-full bg-primary/15 text-primary grid place-items-center text-xs font-bold shrink-0">3</span>
                <span>{tr("Confirma y encontrarás el icono junto a tus apps.")}</span>
              </li>
              <li className="text-xs text-muted-foreground pl-9"> {tr("Si no ves la opción, navega un poco por la app y vuelve a intentarlo — el navegador la habilita tras unos segundos de uso.")} 

            </li>
            </ol>
          }

          {(platform === "desktop" || platform === "other") &&
          <ol className="space-y-3 text-sm">
              <li className="flex gap-3">
                <span className="size-6 rounded-full bg-primary/15 text-primary grid place-items-center text-xs font-bold shrink-0">1</span>
                <span>{tr("En Chrome o Edge, busca el icono")} <Download className="size-4 inline" /> <strong>{tr("Instalar")}</strong> {tr("en la barra de direcciones.")}</span>
              </li>
              <li className="flex gap-3">
                <span className="size-6 rounded-full bg-primary/15 text-primary grid place-items-center text-xs font-bold shrink-0">2</span>
                <span>{tr("O abre el menú del navegador y selecciona")} <strong>{tr("Instalar Globero…")}</strong></span>
              </li>
              <li className="text-xs text-muted-foreground pl-9"> {tr("En Safari macOS: menú")} 
              <strong>{tr("Archivo → Añadir al Dock")}</strong>.
              </li>
            </ol>
          }

          <div className="flex justify-end mt-2">
            <button
              onClick={() => setOpen(false)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-secondary">
              
              <X className="size-3.5" /> {tr("Cerrar")} 
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>);

}
