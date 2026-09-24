import { tr } from "@/lib/i18n";import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Shield, User as UserIcon, ChevronDown } from "lucide-react";
import { countryName } from "@/lib/countries";
import { listAllUsers, createUser, setUserRole, deleteUser } from "@/lib/admin.functions";
import { useAuth } from "@/lib/use-auth";
import { Field, Info, INPUT_STYLE } from "./AdminField";

export function UsersTab() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listAllUsers);
  const create = useServerFn(createUser);
  const setRole = useServerFn(setUserRole);
  const del = useServerFn(deleteUser);

  const users = useQuery({ queryKey: ["all_users"], queryFn: () => list({ data: undefined }) });
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [f, setF] = useState({ email: "", password: "", full_name: "", role: "user" as "user" | "admin" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await create({ data: f });
      toast.success(tr("Usuario creado"));
      setOpen(false);setF({ email: "", password: "", full_name: "", role: "user" });
      qc.invalidateQueries({ queryKey: ["all_users"] });
    } catch (e: any) {toast.error(e.message);}
  };

  const toggleRole = async (uid: string, current: string[]) => {
    const next = current.includes("admin") ? "user" : "admin";
    await setRole({ data: { userId: uid, role: next } });
    toast.success(`${tr("Rol cambiado a")} ${next}`);
    qc.invalidateQueries({ queryKey: ["all_users"] });
  };

  const remove = async (uid: string) => {
    if (!confirm(tr("¿Eliminar usuario? Sus datos se perderán."))) return;
    try {await del({ data: { userId: uid } });toast.success(tr("Eliminado"));qc.invalidateQueries({ queryKey: ["all_users"] });}
    catch (e: any) {toast.error(e.message);}
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold">
          <Plus className="size-4" /> {tr("Nuevo usuario")} 
        </button>
      </div>
      <div className="bg-surface border rounded-xl divide-y">
        {(users.data ?? []).map((u: any) => {
          const isAdmin = u.roles.includes("admin");
          const isOpen = expanded === u.id;
          return (
            <div key={u.id}>
              <button type="button" onClick={() => setExpanded(isOpen ? null : u.id)} className="w-full p-4 flex items-center justify-between gap-3 text-left hover:bg-secondary/40">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-10 rounded-full bg-primary/10 text-primary grid place-items-center text-sm font-bold">
                    {(u.full_name ?? u.email)?.[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{u.full_name ?? u.email}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {u.deactivated_at && <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-destructive/10 text-destructive">{tr("Baja")}</span>}
                  <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${isAdmin ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
                    {isAdmin ? "Admin" : "Usuario"}
                  </span>
                  <ChevronDown className={`size-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                </div>
              </button>
              {isOpen &&
              <div className="px-4 pb-4 space-y-3 bg-secondary/20">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs pt-3">
                    <Info label={tr("Nombre")} value={u.full_name ?? "—"} />
                    <Info label="Email" value={u.email} />
                    <Info label={tr("País")} value={countryName(u.country) ?? "—"} />
                    <Info label={tr("Alta")} value={u.created_at ? new Date(u.created_at).toLocaleDateString("es-ES") : "—"} />
                    <Info label={tr("Llamadas IA")} value={String(u.ai_calls ?? 0)} />
                    <Info label={tr("Tokens IA")} value={(u.ai_tokens ?? 0).toLocaleString("es-ES")} />
                    <Info label="Telegram" value={u.telegram ? "Conectado" : "No"} />
                    <Info label="Intervals.icu" value={u.intervals ? "Conectado" : "No"} />
                  </div>
                  {u.id !== me?.id &&
                <div className="flex flex-wrap gap-2">
                      <button onClick={() => toggleRole(u.id, u.roles)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold hover:bg-secondary">
                        {isAdmin ? <UserIcon className="size-3.5" /> : <Shield className="size-3.5" />}
                        {isAdmin ? "Quitar admin" : "Convertir en Admin"}
                      </button>
                      <button onClick={() => remove(u.id)} className="inline-flex items-center gap-2 rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground">
                        <Trash2 className="size-3.5" /> {tr("Eliminar usuario")} 
                  </button>
                    </div>
                }
                </div>
              }
            </div>);

        })}
      </div>

      {open &&
      <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4">
          <form onSubmit={submit} className="bg-background border rounded-xl p-6 w-full max-w-md space-y-3">
            <h3 className="font-display text-2xl font-bold uppercase">{tr("Nuevo usuario")}</h3>
            <Field label={tr("Nombre")}><input required className="input" value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
            <Field label="Email"><input required type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
            <Field label={tr("Contraseña (mín. 8)")}><input required type="password" minLength={8} className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
            <Field label={tr("Rol")}>
              <select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as any })}>
                <option value="user">{tr("Usuario")}</option><option value="admin">Admin</option>
              </select>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 border rounded-lg text-sm">{tr("Cancelar")}</button>
              <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold">{tr("Crear")}</button>
            </div>
            <style>{INPUT_STYLE}</style>
          </form>
        </div>
      }
    </div>);

}
