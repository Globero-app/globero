import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/use-auth";
import { tr } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Contact = { id: string; name: string; email: string; notify_on_start: boolean };

export function EmergencyContacts() {
  const { user } = useAuth();
  const [list, setList] = useState<Contact[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const load = () => user && (supabase as any).from("emergency_contacts").select("id,name,email,notify_on_start")
    .eq("user_id", user.id).order("created_at").then(({ data }: any) => setList(data ?? []));
  useEffect(() => { load(); }, [user]);

  const add = async () => {
    if (!user || !name.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) return toast.error(tr("Introduce un nombre y un email válidos"));
    const { error } = await (supabase as any).from("emergency_contacts").insert({ user_id: user.id, name: name.trim().slice(0, 100), email: email.trim().slice(0, 255) });
    if (error) return toast.error(tr("No se pudo guardar el contacto"));
    setName(""); setEmail(""); load();
  };
  const toggle = async (c: Contact) => { await (supabase as any).from("emergency_contacts").update({ notify_on_start: !c.notify_on_start }).eq("id", c.id); load(); };
  const del = async (id: string) => { await (supabase as any).from("emergency_contacts").delete().eq("id", id); load(); };

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <h2 className="font-semibold">{tr("Contactos de emergencia")}</h2>
        <p className="text-sm text-muted-foreground">{tr("Recibirán un email con tu posición en directo si activas el SOS. Opcionalmente, también al iniciar y finalizar la salida.")}</p>
        {list.map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-lg bg-muted p-2 text-sm">
            <div className="flex-1 min-w-0"><p className="font-medium truncate">{c.name}</p><p className="text-xs text-muted-foreground truncate">{c.email}</p></div>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={c.notify_on_start} onChange={() => toggle(c)} /> {tr("Inicio/fin")}</label>
            <Button variant="ghost" size="icon" onClick={() => del(c.id)}><Trash2 className="size-4" /></Button>
          </div>
        ))}
        <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
          <Input placeholder={tr("Nombre")} value={name} onChange={(e) => setName(e.target.value)} />
          <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button onClick={add}><UserPlus className="size-4" /> {tr("Añadir")}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
