import { tr } from "@/lib/i18n";import { Moon, Sun, Monitor } from "lucide-react";
import { useTheme, type Theme } from "@/lib/use-theme";

export function ThemeToggle({ compact = false }: {compact?: boolean;}) {
  const { theme, resolved, setTheme, toggle } = useTheme();

  if (compact) {
    return (
      <button
        onClick={toggle}
        aria-label={tr("Cambiar tema")}
        title={resolved === "dark" ? "Modo claro" : "Modo oscuro"}
        className="p-2 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
        
        {resolved === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
      </button>);

  }

  const opts: {value: Theme;icon: typeof Sun;label: string;}[] = [
  { value: "light", icon: Sun, label: "Claro" },
  { value: "dark", icon: Moon, label: "Oscuro" },
  { value: "system", icon: Monitor, label: "Auto" }];


  return (
    <div className="flex items-center gap-1 p-1 rounded-lg bg-secondary/60 border border-border/50">
      {opts.map(({ value, icon: Icon, label }) =>
      <button
        key={value}
        onClick={() => setTheme(value)}
        className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
        theme === value ?
        "bg-background text-foreground shadow-sm" :
        "text-muted-foreground hover:text-foreground"}`
        }
        aria-pressed={theme === value}>
        
          <Icon className="size-3.5" />
          {label}
        </button>
      )}
    </div>);

}
