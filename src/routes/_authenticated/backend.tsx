import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAllUsers, createUser, setUserRole, deleteUser, updateAppConfig } from "@/lib/admin.functions";
import { useAppConfig } from "@/lib/use-app-config";
import { useAuth } from "@/lib/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Shield, User as UserIcon, ArrowUp, ArrowDown, Eye, EyeOff } from "lucide-react";
import { SiteContentTab } from "@/components/SiteContentTab";


export const Route = createFileRoute("/_authenticated/backend")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", data.user.id).eq("role", "admin").maybeSingle();
    if (!role) throw redirect({ to: "/app" });
  },
  component: BackendPage,
});

function BackendPage() {
  const [tab, setTab] = useState<"config" | "users" | "sponsors" | "site">("config");
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Administración</p>
        <h1 className="font-display text-4xl font-bold uppercase tracking-tight">Backend</h1>
      </div>
      <div className="border-b flex gap-1 flex-wrap">
        {[["config", "Configuración visual"], ["users", "Usuarios"], ["sponsors", "Patrocinadores"], ["site", "Web pública"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as any)} className={`px-4 py-2 text-sm font-semibold border-b-2 transition-colors ${tab === k ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}>
            {l}
          </button>
        ))}
      </div>
      {tab === "config" ? <ConfigTab /> : tab === "users" ? <UsersTab /> : tab === "sponsors" ? <SponsorsTab /> : <SiteContentTab />}
    </div>
  );
}


function ConfigTab() {
  const cfg = useAppConfig();
  const qc = useQueryClient();
  const update = useServerFn(updateAppConfig);
  const [f, setF] = useState<any>({});
  useEffect(() => { if (cfg.data) setF(cfg.data); }, [cfg.data]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await update({ data: f });
      toast.success("Configuración guardada");
      qc.invalidateQueries({ queryKey: ["app_config"] });
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <form onSubmit={save} className="grid md:grid-cols-2 gap-4 max-w-3xl">
      <Field label="Nombre del equipo"><input className="input" value={f.team_name ?? ""} onChange={(e) => setF({...f, team_name: e.target.value})} /></Field>
      <Field label="Color primario"><input type="color" className="input h-10" value={f.primary_color ?? "#e11d48"} onChange={(e) => setF({...f, primary_color: e.target.value})} /></Field>
      <Field label="Color de acento"><input type="color" className="input h-10" value={f.accent_color ?? "#0f172a"} onChange={(e) => setF({...f, accent_color: e.target.value})} /></Field>
      <Field label="Color de botones"><input type="color" className="input h-10" value={f.button_color ?? "#e11d48"} onChange={(e) => setF({...f, button_color: e.target.value})} /></Field>
      <Field label="Fuente cuerpo">
        <select className="input" value={f.font_family ?? "Inter"} onChange={(e) => setF({...f, font_family: e.target.value})}>
          <option>Inter</option><option>Roboto</option><option>Lato</option><option>Open Sans</option><option>System</option>
        </select>
      </Field>
      <Field label="Fuente display">
        <select className="input" value={f.display_font ?? "Barlow Condensed"} onChange={(e) => setF({...f, display_font: e.target.value})}>
          <option>Barlow Condensed</option><option>Oswald</option><option>Anton</option><option>Bebas Neue</option>
        </select>
      </Field>
      <div className="md:col-span-2"><button type="submit" className="bg-primary text-primary-foreground px-6 py-2.5 rounded-lg font-semibold text-sm">Guardar configuración</button></div>
      <style>{`.input{width:100%;padding:.55rem .75rem;border-radius:.5rem;border:1px solid var(--border);background:var(--surface);font-size:.875rem;outline:none}`}</style>
    </form>
  );
}

function UsersTab() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const list = useServerFn(listAllUsers);
  const create = useServerFn(createUser);
  const setRole = useServerFn(setUserRole);
  const del = useServerFn(deleteUser);

  const users = useQuery({ queryKey: ["all_users"], queryFn: () => list({ data: undefined }) });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ email: "", password: "", full_name: "", role: "user" as "user" | "admin" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await create({ data: f });
      toast.success("Usuario creado");
      setOpen(false); setF({ email: "", password: "", full_name: "", role: "user" });
      qc.invalidateQueries({ queryKey: ["all_users"] });
    } catch (e: any) { toast.error(e.message); }
  };

  const toggleRole = async (uid: string, current: string[]) => {
    const next = current.includes("admin") ? "user" : "admin";
    await setRole({ data: { userId: uid, role: next } });
    toast.success(`Rol cambiado a ${next}`);
    qc.invalidateQueries({ queryKey: ["all_users"] });
  };

  const remove = async (uid: string) => {
    if (!confirm("¿Eliminar usuario? Sus datos se perderán.")) return;
    try { await del({ data: { userId: uid } }); toast.success("Eliminado"); qc.invalidateQueries({ queryKey: ["all_users"] }); }
    catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold">
          <Plus className="size-4" /> Nuevo usuario
        </button>
      </div>
      <div className="bg-surface border rounded-xl divide-y">
        {(users.data ?? []).map((u: any) => {
          const isAdmin = u.roles.includes("admin");
          return (
            <div key={u.id} className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-10 rounded-full bg-primary/10 text-primary grid place-items-center text-sm font-bold">
                  {(u.full_name ?? u.email)?.[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold truncate">{u.full_name ?? u.email}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded ${isAdmin ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
                  {isAdmin ? "Admin" : "Usuario"}
                </span>
                {u.id !== me?.id && (
                  <>
                    <button onClick={() => toggleRole(u.id, u.roles)} className="p-1.5 text-muted-foreground hover:text-foreground" title="Cambiar rol">
                      {isAdmin ? <UserIcon className="size-4" /> : <Shield className="size-4" />}
                    </button>
                    <button onClick={() => remove(u.id)} className="p-1.5 text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4">
          <form onSubmit={submit} className="bg-background border rounded-xl p-6 w-full max-w-md space-y-3">
            <h3 className="font-display text-2xl font-bold uppercase">Nuevo usuario</h3>
            <Field label="Nombre"><input required className="input" value={f.full_name} onChange={(e) => setF({...f, full_name: e.target.value})} /></Field>
            <Field label="Email"><input required type="email" className="input" value={f.email} onChange={(e) => setF({...f, email: e.target.value})} /></Field>
            <Field label="Contraseña (mín. 8)"><input required type="password" minLength={8} className="input" value={f.password} onChange={(e) => setF({...f, password: e.target.value})} /></Field>
            <Field label="Rol">
              <select className="input" value={f.role} onChange={(e) => setF({...f, role: e.target.value as any})}>
                <option value="user">Usuario</option><option value="admin">Admin</option>
              </select>
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold">Crear</button>
            </div>
            <style>{`.input{width:100%;padding:.55rem .75rem;border-radius:.5rem;border:1px solid var(--border);background:var(--surface);font-size:.875rem;outline:none}`}</style>
          </form>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: any) {
  return <label className="block"><span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</span><div className="mt-1">{children}</div></label>;
}

function SponsorsTab() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["sponsors_admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sponsors")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [f, setF] = useState({ name: "", logo_url: "", website_url: "", sort_order: 0, active: true });

  const startNew = () => {
    setEditing(null);
    setF({ name: "", logo_url: "", website_url: "", sort_order: (list.data?.length ?? 0) * 10, active: true });
    setOpen(true);
  };

  const startEdit = (s: any) => {
    setEditing(s);
    setF({
      name: s.name ?? "",
      logo_url: s.logo_url ?? "",
      website_url: s.website_url ?? "",
      sort_order: s.sort_order ?? 0,
      active: s.active ?? true,
    });
    setOpen(true);
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["sponsors_admin"] });
    qc.invalidateQueries({ queryKey: ["sponsors_public"] });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: f.name.trim(),
        logo_url: f.logo_url.trim(),
        website_url: f.website_url.trim() || null,
        sort_order: Number(f.sort_order) || 0,
        active: f.active,
      };
      if (editing) {
        const { error } = await supabase.from("sponsors").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Patrocinador actualizado");
      } else {
        const { error } = await supabase.from("sponsors").insert(payload);
        if (error) throw error;
        toast.success("Patrocinador añadido");
      }
      setOpen(false);
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("¿Eliminar este patrocinador?")) return;
    const { error } = await supabase.from("sponsors").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Eliminado");
    refresh();
  };

  const toggleActive = async (s: any) => {
    const { error } = await supabase.from("sponsors").update({ active: !s.active }).eq("id", s.id);
    if (error) return toast.error(error.message);
    refresh();
  };

  const move = async (s: any, dir: -1 | 1) => {
    const items = [...(list.data ?? [])];
    const idx = items.findIndex((x) => x.id === s.id);
    const swap = items[idx + dir];
    if (!swap) return;
    const a = s.sort_order, b = swap.sort_order;
    await supabase.from("sponsors").update({ sort_order: b }).eq("id", s.id);
    await supabase.from("sponsors").update({ sort_order: a }).eq("id", swap.id);
    refresh();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Los logos aparecen en el footer de toda la app, en orden ascendente.</p>
        <button onClick={startNew} className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold">
          <Plus className="size-4" /> Nuevo
        </button>
      </div>
      <div className="bg-surface border rounded-xl divide-y">
        {(list.data ?? []).length === 0 && (
          <div className="p-6 text-sm text-muted-foreground text-center">Aún no hay patrocinadores.</div>
        )}
        {(list.data ?? []).map((s: any, i: number, arr: any[]) => (
          <div key={s.id} className="p-4 flex items-center gap-4">
            <div className="w-24 h-12 grid place-items-center bg-background rounded border shrink-0">
              {s.logo_url ? (
                <img src={s.logo_url} alt={s.name} className="max-h-10 max-w-full object-contain" />
              ) : (
                <span className="text-[10px] text-muted-foreground">sin logo</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className={`font-semibold truncate ${s.active ? "" : "opacity-50"}`}>{s.name}</p>
              <p className="text-xs text-muted-foreground truncate">{s.website_url || "Sin enlace"}</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => move(s, -1)} disabled={i === 0} className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30" title="Subir">
                <ArrowUp className="size-4" />
              </button>
              <button onClick={() => move(s, 1)} disabled={i === arr.length - 1} className="p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30" title="Bajar">
                <ArrowDown className="size-4" />
              </button>
              <button onClick={() => toggleActive(s)} className="p-1.5 text-muted-foreground hover:text-foreground" title={s.active ? "Ocultar" : "Mostrar"}>
                {s.active ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              </button>
              <button onClick={() => startEdit(s)} className="px-2 py-1 text-xs font-semibold border rounded hover:bg-secondary">Editar</button>
              <button onClick={() => remove(s.id)} className="p-1.5 text-muted-foreground hover:text-destructive">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4">
          <form onSubmit={submit} className="bg-background border rounded-xl p-6 w-full max-w-md space-y-3">
            <h3 className="font-display text-2xl font-bold uppercase">{editing ? "Editar" : "Nuevo"} patrocinador</h3>
            <Field label="Nombre"><input required className="input" value={f.name} onChange={(e) => setF({...f, name: e.target.value})} /></Field>
            <Field label="URL del logo (https://...)">
              <input required type="url" className="input" placeholder="https://ejemplo.com/logo.png" value={f.logo_url} onChange={(e) => setF({...f, logo_url: e.target.value})} />
            </Field>
            {f.logo_url && (
              <div className="bg-surface border rounded p-3 grid place-items-center">
                <img src={f.logo_url} alt="preview" className="max-h-16 object-contain" />
              </div>
            )}
            <Field label="Enlace web (opcional)">
              <input type="url" className="input" placeholder="https://patrocinador.com" value={f.website_url} onChange={(e) => setF({...f, website_url: e.target.value})} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Orden">
                <input type="number" className="input" value={f.sort_order} onChange={(e) => setF({...f, sort_order: Number(e.target.value)})} />
              </Field>
              <Field label="Visible">
                <select className="input" value={f.active ? "1" : "0"} onChange={(e) => setF({...f, active: e.target.value === "1"})}>
                  <option value="1">Sí</option><option value="0">No</option>
                </select>
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
              <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold">Guardar</button>
            </div>
            <style>{`.input{width:100%;padding:.55rem .75rem;border-radius:.5rem;border:1px solid var(--border);background:var(--surface);font-size:.875rem;outline:none}`}</style>
          </form>
        </div>
      )}
    </div>
  );
}
