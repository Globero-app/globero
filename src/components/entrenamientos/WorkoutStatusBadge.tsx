import { tr } from "@/lib/i18n";

export function WorkoutStatusBadge({ status }: { status?: string | null }) {
  if (status !== "skipped") return null;
  return (
    <span className="inline-flex shrink-0 items-center rounded border border-border bg-muted px-2 py-0.5 text-[10px] font-mono font-semibold uppercase text-muted-foreground">
      {tr("Omitido")}
    </span>
  );
}