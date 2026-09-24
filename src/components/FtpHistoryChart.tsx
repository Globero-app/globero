import { tr } from "@/lib/i18n";import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Gauge } from "lucide-react";
import { Link } from "@tanstack/react-router";

export interface FtpTestPoint {
  date: string;
  ftp: number | null;
  lthr: number | null;
  avg_watts_20min: number | null;
  source?: string;
}

export function FtpHistoryChart({ history, weightKg }: {history: FtpTestPoint[];weightKg?: number | null;}) {
  const data = (history ?? []).map((t) => ({
    ...t,
    label: format(new Date(`${t.date}T12:00:00Z`), "d MMM", { locale: es })
  }));

  const last = data[data.length - 1];
  const prev = data[data.length - 2];
  const delta = last?.ftp && prev?.ftp ? last.ftp - prev.ftp : null;

  return (
    <section className="bg-surface border rounded-xl p-4 sm:p-5">
      <h2 className="font-display text-lg font-bold uppercase flex items-center gap-2">
        <Gauge className="size-4 text-primary" /> {tr("Tests de FTP")} 
      </h2>
      {data.length === 0 ?
      <p className="text-sm text-muted-foreground mt-2"> {tr("Aún no has registrado ningún test.")}
        {" "}
          <Link to="/ftp-test" className="underline font-semibold">{tr("Hacer el test de 20 min →")}</Link>
        </p> :

      <>
          <p className="text-xs text-muted-foreground mt-1"> {tr("Último test:")} 
          <strong>{last?.ftp ?? "—"} {tr("W")}</strong>
            {weightKg && last?.ftp ? ` · ${Math.round(last.ftp / weightKg * 100) / 100} W/kg` : ""}
            {delta != null ? ` · ${delta >= 0 ? "+" : ""}${delta} W respecto al anterior` : ""}
            {last?.lthr ? ` · LTHR ${last.lthr} ppm` : ""}
          </p>
          <div className="h-52 mt-4 -ml-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={["dataMin - 15", "dataMax + 15"]} />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="ftp" name="FTP (W)" stroke="var(--primary)" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                <Line type="monotone" dataKey="lthr" name="LTHR (ppm)" stroke="#ef4444" strokeWidth={1.5} dot={{ r: 3 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2"> {tr("Cada test actualiza tus zonas y la IA planifica los siguientes entrenamientos con el nuevo umbral.")} 

        </p>
        </>
      }
    </section>);

}
