import darkLogo from "@/assets/globero-dark.jpg.asset.json";
import lightLogo from "@/assets/globero-light.jpg.asset.json";
import { useTheme } from "@/lib/use-theme";

export function BrandLogo({ className = "h-10 w-auto" }: { className?: string }) {
  const { resolved } = useTheme();
  return (
    <img
      src={resolved === "dark" ? darkLogo.url : lightLogo.url}
      alt="Globero — Plataforma de IA para ciclistas"
      className={`${className} object-contain`}
    />
  );
}
