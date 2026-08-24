import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, Send, Unlink } from "lucide-react";
import { getTelegramStatus, generateTelegramCode, disconnectTelegram } from "@/lib/telegram.functions";

export function TelegramSection() {
  const qc = useQueryClient();
  const status = useServerFn(getTelegramStatus);
  const genCode = useServerFn(generateTelegramCode);
  const disconnect = useServerFn(disconnectTelegram);

  const q = useQuery({
    queryKey: ["telegram-status"],
    queryFn: () => status({ data: undefined }),
  });

  const data = q.data;
  const link = data?.bot_username && data?.linking_code ? `https://t.me/${data.bot_username}?start=${data.linking_code}` : null;

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Cargando…</p>;

  if (data?.connected) {
    return (
      <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg p-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-5 text-emerald-600" />
          <div>
            <p className="font-semibold text-emerald-800">Telegram conectado</p>
            <p className="text-xs text-emerald-700">Escribe al bot para consultar o adaptar tu entreno de hoy.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            await disconnect({ data: undefined });
            toast.success("Telegram desconectado");
            qc.invalidateQueries({ queryKey: ["telegram-status"] });
          }}
          className="text-xs font-semibold text-destructive hover:underline flex items-center gap-1"
        >
          <Unlink className="size-3" /> Desconectar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Genera un código y ábrelo en Telegram para vincular tu cuenta. Después podrás registrar tu Readiness y pedir cambios de
        entreno desde el chat.
      </p>
      {data?.linking_code && (
        <p className="text-sm">
          Tu código: <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{data.linking_code}</code>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={async () => {
            try {
              await genCode({ data: undefined });
              await qc.invalidateQueries({ queryKey: ["telegram-status"] });
              toast.success("Código generado");
            } catch (e: any) {
              toast.error(e.message);
            }
          }}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90"
        >
          Generar código
        </button>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-2 bg-[#229ED9] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90"
          >
            <Send className="size-4" /> Abrir en Telegram
          </a>
        )}
      </div>
      {!data?.bot_username && (
        <p className="text-[11px] text-muted-foreground">No se ha podido obtener el nombre del bot. Revisa la conexión de Telegram.</p>
      )}
    </div>
  );
}
