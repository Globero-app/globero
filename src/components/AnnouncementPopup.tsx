import { tr } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";

const db = supabase as any;

export function AnnouncementPopup() {
  const { user } = useAuth();
  const [queue, setQueue] = useState<any[]>([]);
  const [dontShow, setDontShow] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: anns }, { data: dis }] = await Promise.all([
        db.from("announcements").select("id,title,body").eq("active", true).order("created_at", { ascending: false }),
        db.from("announcement_dismissals").select("announcement_id").eq("user_id", user.id),
      ]);
      const hidden = new Set((dis ?? []).map((d: any) => d.announcement_id));
      const seen = new Set(JSON.parse(sessionStorage.getItem("ann_closed") ?? "[]"));
      setQueue((anns ?? []).filter((a: any) => !hidden.has(a.id) && !seen.has(a.id)));
    })();
  }, [user?.id]);

  const current = queue[0];
  if (!current) return null;

  const close = async () => {
    if (dontShow && user) {
      await db.from("announcement_dismissals").insert({ user_id: user.id, announcement_id: current.id });
    }
    const seen = JSON.parse(sessionStorage.getItem("ann_closed") ?? "[]");
    sessionStorage.setItem("ann_closed", JSON.stringify([...seen, current.id]));
    setDontShow(false);
    setQueue((q) => q.slice(1));
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 grid place-items-center p-4">
      <div role="dialog" aria-modal="true" className="bg-background border rounded-xl p-6 w-full max-w-md space-y-4">
        <h3 className="font-display text-2xl font-bold uppercase">{current.title}</h3>
        <p className="text-sm whitespace-pre-line">{current.body}</p>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
          {tr("No volver a mostrar")}
        </label>
        <div className="flex justify-end">
          <button onClick={close} className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold">{tr("Cerrar")}</button>
        </div>
      </div>
    </div>
  );
}
