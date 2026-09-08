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
