export function Section({ title, children, className = "" }: any) {
  return (
    <div className={`bg-surface border rounded-xl p-5 space-y-3 ${className}`}>
      <h3 className="font-display text-lg font-bold uppercase tracking-tight">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export function Field({ label, children }: any) {
  return <label className="block"><span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</span><div className="mt-1">{children}</div></label>;
}

export function Collapsible({ title, children, defaultOpen = false }: any) {
  return (
    <details open={defaultOpen} className="group rounded-xl bg-muted min-w-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 truncate">{title}</span>
        <span className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="space-y-3 px-4 pb-4">{children}</div>
    </details>
  );
}
