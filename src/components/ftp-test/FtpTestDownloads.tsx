import { toast } from "sonner";
import { Download, FileDown } from "lucide-react";
import { downloadFit, type FitWorkoutStep } from "@/lib/fit-writer";
import { downloadZwo } from "@/lib/zwo-writer";
import { buildTestSteps } from "./test-protocol";

export function FtpTestDownloads({ ftp }: { ftp: number | null }) {
  const referenceFtp = ftp && ftp > 0 ? ftp : 200;

  const handleDownloadZwo = () => {
    const steps = buildTestSteps(referenceFtp);
    downloadZwo(
      { name: "Test FTP 20min", description: `Protocolo Coggan 20 min. FTP referencia: ${referenceFtp}W. FTP real ≈ 0.95 × media de los 20 min.`, author: "Globero", steps },
      referenceFtp,
      "test-ftp-20min",
    );
    toast.success(".zwo descargado. Súbelo a Zwift o TrainingPeaks.");
  };

  const handleDownloadFit = () => {
    const steps = buildTestSteps(referenceFtp);
    downloadFit({ name: "Test FTP", sport: "cycling", steps: steps as FitWorkoutStep[] }, "test-ftp-20min");
    toast.success(".fit descargado. Copíalo a tu ciclocomputador (Garmin, Wahoo).");
  };

  return (
    <div className="bg-surface border rounded-xl p-5 space-y-3">
      <h2 className="font-display text-lg font-bold uppercase tracking-tight flex items-center gap-2">
        <FileDown className="size-5" /> Descargar el test
      </h2>
      <p className="text-sm text-muted-foreground">
        Descarga el bloque completo (calentamiento + 20 min all-out + vuelta a la calma) para hacerlo en Zwift, TrainingPeaks o tu ciclocomputador (Garmin / Wahoo).
        {!ftp && " Sin FTP en tu perfil se usa una referencia de 200 W para calcular los porcentajes; ajústalos si es necesario."}
      </p>
      <div className="flex flex-wrap gap-2">
        <button onClick={handleDownloadZwo} className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90">
          <Download className="size-4" /> Descargar .zwo (Zwift)
        </button>
        <button onClick={handleDownloadFit} className="inline-flex items-center gap-2 border px-4 py-2 rounded-lg text-sm font-semibold hover:bg-muted">
          <Download className="size-4" /> Descargar .fit (Garmin/Wahoo)
        </button>
      </div>
    </div>
  );
}
