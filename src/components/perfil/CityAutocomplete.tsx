import { useEffect, useRef, useState } from "react";

export type CityPick = { city: string; country: string; lat: number; lon: number; label: string };
type Geo = { id: number; name: string; latitude: number; longitude: number; country?: string; country_code?: string; admin1?: string; admin2?: string };

export function CityAutocomplete({ value, onChange, onPick, placeholder }: { value: string; onChange: (v: string) => void; onPick: (p: CityPick) => void; placeholder?: string }) {
  const [items, setItems] = useState<Geo[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const typed = useRef(false);

  useEffect(() => {
    if (!typed.current || value.trim().length < 2) { setItems([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const p = new URLSearchParams({ name: value.trim(), count: "8", language: "es", format: "json" });
        const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${p}`, { signal: ctrl.signal });
        const j = await r.json();
        setItems(j.results ?? []);
        setOpen(true);
      } catch { /* ignore */ } finally { setLoading(false); }
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [value]);

  const labelOf = (g: Geo) => [g.name, g.admin2 && g.admin2 !== g.name ? g.admin2 : null, g.admin1, g.country].filter(Boolean).join(", ");

  return (
    <div className="relative">
      <input className="input" placeholder={placeholder} value={value} autoComplete="off"
        onChange={(e) => { typed.current = true; onChange(e.target.value); }}
        onFocus={() => items.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} />
      {open && (items.length > 0 || loading) && (
        <ul className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-lg border bg-popover text-popover-foreground shadow-lg text-sm">
          {loading && !items.length && <li className="px-3 py-2 text-muted-foreground">…</li>}
          {items.map((g) => (
            <li key={g.id}>
              <button type="button" className="w-full text-left px-3 py-2 hover:bg-muted"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  typed.current = false;
                  setOpen(false);
                  onPick({ city: g.name, country: (g.country_code ?? "").toUpperCase(), lat: g.latitude, lon: g.longitude, label: labelOf(g) });
                }}>
                {labelOf(g)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
