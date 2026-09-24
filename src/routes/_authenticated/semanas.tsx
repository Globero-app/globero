import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/semanas")({
  beforeLoad: () => {
    throw redirect({ to: "/progreso", search: { vista: "semanal" } });
  },
  head: () => ({
    meta: [
      { title: "Resumen semanal · Globero" },
      { name: "description", content: "Resumen semanal integrado en Progreso." },
      { property: "og:title", content: "Resumen semanal · Globero" },
      { property: "og:description", content: "Consulta kilómetros, horas, vatios y carga semanal." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
