import { tr } from "@/lib/i18n";import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { Gauge, CheckCheck } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { FtpTestDownloads } from "@/components/ftp-test/FtpTestDownloads";
import { FtpTestScheduler } from "@/components/ftp-test/FtpTestScheduler";
import { FtpTestImport } from "@/components/ftp-test/FtpTestImport";
import { FtpTestTimer } from "@/components/ftp-test/FtpTestTimer";
import { FtpTestResult } from "@/components/ftp-test/FtpTestResult";

export const Route = createFileRoute("/_authenticated/ftp-test")({
  component: FtpTestPage
});

function FtpTestPage() {
  const { user } = useAuth();
  const [finished, setFinished] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  const profileQ = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("ftp,intervals_api_key,ftp_test_completed_at,max_hr,lthr,zones_display_mode").eq("id", user!.id).maybeSingle();
      return data;
    },
    enabled: !!user
  });

  const profile = profileQ.data;
  const icuConnected = !!profile?.intervals_api_key;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{tr("Onboarding · Prueba guiada")}</p>
        <h1 className="font-display text-4xl font-bold uppercase tracking-tight flex items-center gap-3">
          <Gauge className="size-9" /> {tr("Test de FTP 20 min")} 
        </h1>
        <p className="mt-2 text-sm text-muted-foreground"> {tr("Protocolo clásico Coggan: 20 min a máximo esfuerzo sostenible. FTP ≈ 95% de la potencia media de esos 20 min.")} 

        </p>
        {profile?.ftp_test_completed_at &&
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
            <CheckCheck className="size-4" /> {tr("Último test realizado el")} {format(new Date(profile.ftp_test_completed_at), "d MMM yyyy", { locale: es })}
          </p>
        }
      </div>

      <FtpTestDownloads ftp={profile?.ftp ?? null} />
      <FtpTestScheduler profile={profile} />
      <FtpTestImport icuConnected={icuConnected} onImported={() => setFinished(false)} />

      {!finished ?
      <FtpTestTimer resetKey={resetKey} onFinish={() => setFinished(true)} /> :

      <FtpTestResult
        profile={profile}
        onRepeat={() => {setFinished(false);setResetKey((k) => k + 1);}} />

      }
    </div>);

}
