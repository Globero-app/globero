import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/intervals/callback")({
  ssr: false,
  component: IntervalsCallback,
  head: () => ({
    meta: [
      { title: "Vinculando Intervals.icu · Globero IA" },
      { name: "description", content: "Finalizando la conexión de tu cuenta de Intervals.icu con Globero IA." },
      { property: "og:title", content: "Vinculando Intervals.icu · Globero IA" },
      { property: "og:description", content: "Finalizando la conexión de tu cuenta de Intervals.icu con Globero IA." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function IntervalsCallback() {
  const navigate = useNavigate();
  const [msg, setMsg] = useState("Vinculando tu cuenta de Intervals.icu…");
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const err = params.get("error");
      if (err || !code || !state) {
        toast.error("No se pudo autorizar Intervals.icu");
        navigate({ to: "/perfil" });
        return;
      }
      window.location.replace(`/api/public/intervals/callback?${params.toString()}`);
    })();
  }, [navigate]);

  return (
    <div className="min-h-[60vh] grid place-items-center p-8">
      <p className="text-sm text-muted-foreground">{msg}</p>
    </div>
  );
}
