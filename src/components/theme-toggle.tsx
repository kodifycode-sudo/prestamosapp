"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const sinSuscripcion = () => () => {};

export function ThemeToggle({ collapsed = false }: { collapsed?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  // false en el servidor y en la hidratación, true ya en el cliente: el tema
  // resuelto solo se conoce en el navegador.
  const mounted = useSyncExternalStore(
    sinSuscripcion,
    () => true,
    () => false
  );

  if (!mounted) {
    return <div className={collapsed ? "size-9" : "h-9"} />;
  }

  const isDark = resolvedTheme === "dark";

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            aria-label="Cambiar tema"
          >
            {isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Cambiar tema</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-muted-foreground">
      <span className="flex items-center gap-2">
        {isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
        Modo oscuro
      </span>
      <Switch
        checked={isDark}
        onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
        aria-label="Cambiar tema"
      />
    </div>
  );
}
