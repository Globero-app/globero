import { tr, activeLang } from "@/lib/i18n";import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarPlus } from "lucide-react";
import { format } from "date-fns";
import { es, ca, fr, enGB, de } from "date-fns/locale";
import { scheduleFtpTest } from "@/lib/workouts.functions";

export function FtpTestScheduler({ profile }: {profile: any;}) {
  const qc = useQueryClient();
  const scheduleTest = useServerFn(scheduleFtpTest);
  const [testDate, setTestDate] = useState<string>(format(new Date(), "yyyy-MM-dd"));
  const [testBasis, setTestBasis] = useState<"power" | "hr">("power");
  const [scheduling, setScheduling] = useState(false);

  const handleScheduleTest = async () => {
    if (!testDate) return;
    setScheduling(true);
    try {
      const r: any = await scheduleTest({ data: { date: testDate, basis: testBasis } });
      toast.success(
        r.intervals_synced ?
        `Test añadido al calendario el ${format(new Date(testDate + "T00:00:00"), "d MMM yyyy", { locale: ({ es, ca, fr, en: enGB, de } as const)[activeLang()] })} y subido a Intervals.icu` :
        `Test añadido al calendario el ${format(new Date(testDate + "T00:00:00"), "d MMM yyyy", { locale: ({ es, ca, fr, en: enGB, de } as const)[activeLang()] })}`
      );
      qc.invalidateQueries({ queryKey: ["calendar"] });
      qc.invalidateQueries({ queryKey: ["workouts"] });
    } catch (e: any) {toast.error(e.message ?? "Error añadiendo el test");} finally
    {setScheduling(false);}
  };

  return (
    <div className="bg-surface border rounded-xl p-5 space-y-3">
      <h2 className="font-display text-lg font-bold uppercase tracking-tight flex items-center gap-2">
        <CalendarPlus className="size-5" /> {tr("Añadir el test al calendario")} 
      </h2>
      <p className="text-sm text-muted-foreground"> {tr("Elige el día en el que quieres hacer el test y en qué base quieres realizarlo. Se creará en tu calendario y, si tienes Intervals.icu conectado, se subirá automáticamente a ese día.")} 


      </p>

      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{tr("Día del test")}</span>
          <input
            type="date"
            value={testDate}
            min={format(new Date(), "yyyy-MM-dd")}
            onChange={(e) => setTestDate(e.target.value)}
            className="mt-1.5 w-full px-3 py-2 rounded-lg border bg-background text-sm" />
          
        </label>
        <div>
          <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{tr("Base del test")}</span>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTestBasis("power")}
              className={`rounded-lg border-2 px-3 py-2 text-left transition ${testBasis === "power" ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
              
              <span className="block text-sm font-semibold">{tr("FTP (W)")}</span>
              <span className="block text-[11px] text-muted-foreground">{profile?.ftp ? `FTP ${profile.ftp} W` : "Referencia 200 W"}</span>
            </button>
            <button
              type="button"
              onClick={() => setTestBasis("hr")}
              className={`rounded-lg border-2 px-3 py-2 text-left transition ${testBasis === "hr" ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
              
              <span className="block text-sm font-semibold">{tr("FC (bpm)")}</span>
              <span className="block text-[11px] text-muted-foreground">
                {profile?.lthr ? `LTHR ${profile.lthr}` : profile?.max_hr ? `FC máx ${profile.max_hr}` : "Sin FC en el perfil"}
              </span>
            </button>
          </div>
        </div>
      </div>

      <button
        onClick={handleScheduleTest}
        disabled={scheduling || !testDate}
        className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50">
        
        <CalendarPlus className="size-4" />
        {scheduling ? "Añadiendo…" : "Añadir test al calendario"}
      </button>
    </div>);

}
