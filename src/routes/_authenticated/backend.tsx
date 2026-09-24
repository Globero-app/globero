import { tr } from "@/lib/i18n";import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteContentTab } from "@/components/SiteContentTab";
import { ConfigTab } from "@/components/backend/ConfigTab";
import { UsersTab } from "@/components/backend/UsersTab";
import { SponsorsTab } from "@/components/backend/SponsorsTab";
import { ErrorsTab } from "@/components/backend/ErrorsTab";
import { AiUsageTab } from "@/components/backend/AiUsageTab";

export const Route = createFileRoute("/_authenticated/backend")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
    if (!role) throw redirect({ to: "/app" });
  },
  component: BackendPage
});

function BackendPage() {
  const [tab, setTab] = useState<"config" | "users" | "sponsors" | "site" | "errors" | "ia">("config");
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{tr("Administración")}</p>
        <h1 className="font-display text-4xl font-bold uppercase tracking-tight">{tr("Backend")}</h1>
      </div>
      <div className="border-b flex gap-1 flex-wrap">
        {[["config", "Configuración visual"], ["users", "Usuarios"], ["sponsors", "Patrocinadores"], ["site", "Web pública"], ["errors", "Errores"], ["ia", "Uso de IA"]].map(([k, l]) =>
        <button key={k} onClick={() => setTab(k as any)} className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
            {l}
          </button>
        )}
      </div>
      {tab === "config" ? <ConfigTab /> : tab === "users" ? <UsersTab /> : tab === "sponsors" ? <SponsorsTab /> : tab === "errors" ? <ErrorsTab /> : tab === "ia" ? <AiUsageTab /> : <SiteContentTab />}
    </div>);

}
