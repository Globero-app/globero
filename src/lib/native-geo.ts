// Ubicación en segundo plano en Android (Capacitor); en navegador devuelve null.
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { BackgroundGeolocationPlugin } from "@capacitor-community/background-geolocation";

export const isNative = () => Capacitor.isNativePlatform();

export type GeoFix = { latitude: number; longitude: number; altitude: number | null; speed: number | null; heading: number | null; accuracy: number; timestamp: number };

export async function startNativeWatch(onFix: (f: GeoFix) => void, onError: (msg: string, denied: boolean) => void): Promise<(() => void) | null> {
  if (!isNative()) return null;
  const BG = registerPlugin<BackgroundGeolocationPlugin>("BackgroundGeolocation");
  const id = await BG.addWatcher(
    { backgroundMessage: "Baliza activa: compartiendo tu posición", backgroundTitle: "Globero — Baliza", requestPermissions: true, stale: false, distanceFilter: 0 },
    (loc, err) => {
      if (err) return onError(err.message, err.code === "NOT_AUTHORIZED");
      if (loc) onFix({ latitude: loc.latitude, longitude: loc.longitude, altitude: loc.altitude, speed: loc.speed, heading: loc.bearing, accuracy: loc.accuracy, timestamp: loc.time ?? Date.now() });
    },
  );
  return () => { BG.removeWatcher({ id }).catch(() => {}); };
}
