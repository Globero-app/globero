import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppConfig = {
  primary_color: string;
  accent_color: string;
  button_color: string;
  font_family: string;
  display_font: string;
  team_name: string;
};

export const DEFAULT_CONFIG: AppConfig = {
  primary_color: "#e11d48",
  accent_color: "#0f172a",
  button_color: "#e11d48",
  font_family: "Inter",
  display_font: "Barlow Condensed",
  team_name: "Globero",
};

export function useAppConfig() {
  return useQuery({
    queryKey: ["app_config"],
    queryFn: async (): Promise<AppConfig> => {
      const { data } = await supabase.from("app_config").select("*").eq("id", 1).maybeSingle();
      return (data as AppConfig) ?? DEFAULT_CONFIG;
    },
    staleTime: 60_000,
  });
}
