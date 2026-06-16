import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function SponsorsFooter() {
  const { data } = useQuery({
    queryKey: ["sponsors_public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sponsors")
        .select("id,name,logo_url,website_url")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  if (!data || data.length === 0) return null;

  return (
    <footer className="mt-12 border-t bg-surface/50">
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-8">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground text-center mb-5">
          Patrocinadores del equipo
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
          {data.map((s) => {
            const img = (
              <img
                src={s.logo_url}
                alt={s.name}
                title={s.name}
                loading="lazy"
                className="h-10 md:h-12 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity grayscale hover:grayscale-0"
              />
            );
            return s.website_url ? (
              <a key={s.id} href={s.website_url} target="_blank" rel="noopener noreferrer">
                {img}
              </a>
            ) : (
              <div key={s.id}>{img}</div>
            );
          })}
        </div>
      </div>
    </footer>
  );
}
