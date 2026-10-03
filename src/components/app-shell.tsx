"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  HandCoins,
  Receipt,
  UserCog,
  LogOut,
  Calculator,
  CalendarDays,
  RefreshCw,
  ShieldCheck,
  FileBarChart,
  Building2,
  Landmark,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
};

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/prestamos", label: "Préstamos", icon: HandCoins },
  { href: "/refinanciaciones", label: "Refinanciaciones", icon: RefreshCw },
  { href: "/calendario", label: "Calendario", icon: CalendarDays },
  { href: "/simulador", label: "Simulador", icon: Calculator },
  { href: "/pagos", label: "Pagos", icon: Receipt },
  { href: "/reportes", label: "Reportes", icon: FileBarChart },
  { href: "/fuentes-ingreso", label: "Fuentes de ingreso", icon: Landmark, adminOnly: true },
  { href: "/usuarios", label: "Usuarios", icon: UserCog, adminOnly: true },
  { href: "/auditoria", label: "Auditoría", icon: ShieldCheck, adminOnly: true },
  { href: "/empresa", label: "Empresa", icon: Building2, adminOnly: true },
];

const SIDEBAR_STORAGE_KEY = "sidebar-collapsed";
const SIDEBAR_EVENTO = "sidebar-collapsed-change";

// Preferencia del menú lateral en localStorage, leída como store externo:
// en el servidor (y en la hidratación) vale false, luego el valor guardado.
function leerSidebarColapsado() {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function guardarSidebarColapsado(valor: boolean) {
  try {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(valor));
  } catch {
    // Sin almacenamiento disponible: el cambio no persiste.
  }
  window.dispatchEvent(new Event(SIDEBAR_EVENTO));
}

function suscribirSidebar(onChange: () => void) {
  window.addEventListener(SIDEBAR_EVENTO, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(SIDEBAR_EVENTO, onChange);
    window.removeEventListener("storage", onChange);
  };
}

type SidebarUser = { nombre: string; email: string; rol: string };

function SidebarNav({
  collapsed,
  user,
  pathname,
  onNavigate,
  onLogout,
}: {
  collapsed: boolean;
  user: SidebarUser;
  pathname: string;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  return (
    <>
      <nav className="flex-1 space-y-1 whitespace-nowrap p-3">
        {navItems
          .filter((item) => !item.adminOnly || user.rol === "ADMIN")
          .map((item) => {
            const active = pathname.startsWith(item.href);
            const link = (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  collapsed && "justify-center px-0",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                )}
              >
                <item.icon className="size-4 shrink-0" />
                {!collapsed && item.label}
              </Link>
            );

            if (!collapsed) return link;

            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            );
          })}
      </nav>
      <div className={cn("border-t p-3", collapsed && "flex flex-col items-center gap-2 p-2")}>
        {!collapsed && (
          <div className="mb-2 px-2 text-sm">
            <div className="font-medium">{user.nombre}</div>
            <div className="text-xs text-muted-foreground">{user.email}</div>
          </div>
        )}
        <ThemeToggle collapsed={collapsed} />
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onLogout}>
                <LogOut className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Cerrar sesión</TooltipContent>
          </Tooltip>
        ) : (
          <Button variant="ghost" className="w-full justify-start gap-2" onClick={onLogout}>
            <LogOut className="size-4" />
            Cerrar sesión
          </Button>
        )}
      </div>
    </>
  );
}

export function AppShell({
  user,
  children,
}: {
  user: SidebarUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const collapsed = useSyncExternalStore(suscribirSidebar, leerSidebarColapsado, () => false);
  // El menú móvil queda abierto solo en la ruta donde se abrió: al navegar se cierra solo.
  const [menuAbiertoEn, setMenuAbiertoEn] = useState<string | null>(null);
  const mobileOpen = menuAbiertoEn === pathname;
  const setMobileOpen = (open: boolean) => setMenuAbiertoEn(open ? pathname : null);

  function toggleCollapsed() {
    guardarSidebarColapsado(!collapsed);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex min-h-svh">
        <aside
          className={cn(
            "hidden flex-col overflow-hidden border-r bg-muted/40 transition-[width] duration-200 lg:flex",
            collapsed ? "w-16" : "w-60"
          )}
        >
          <div
            className={cn(
              "flex h-16 items-center gap-2 whitespace-nowrap border-b",
              collapsed ? "justify-center px-2" : "justify-between px-4"
            )}
          >
            {!collapsed && (
              <span className="flex items-center gap-2 font-semibold">
                <Image unoptimized src="/icon-square.svg" alt="" width={40} height={40} className="shrink-0 rounded-md" />
                RWS
              </span>
            )}
            <Button variant="ghost" size="icon" className="shrink-0" onClick={toggleCollapsed}>
              {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </Button>
          </div>
          <SidebarNav
            collapsed={collapsed}
            user={user}
            pathname={pathname}
            onLogout={handleLogout}
          />
        </aside>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="flex w-60 flex-col gap-0 p-0">
            <SheetHeader className="h-16 flex-row items-center justify-start space-y-0 border-b px-4">
              <SheetTitle className="flex items-center gap-2 text-base font-semibold">
                <Image unoptimized src="/icon-square.svg" alt="" width={40} height={40} className="shrink-0 rounded-md" />
                RWS
              </SheetTitle>
            </SheetHeader>
            <SidebarNav
              collapsed={false}
              user={user}
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
              onLogout={handleLogout}
            />
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center justify-between border-b px-4 lg:hidden">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(true)}>
                <Menu className="size-5" />
              </Button>
              <div className="flex items-center gap-2 font-semibold">
                <Image unoptimized src="/icon-square.svg" alt="" width={40} height={40} className="rounded-md" />
                RWS
              </div>
            </div>
            <ThemeToggle collapsed />
          </header>
          <main className="flex-1 overflow-x-auto p-4 lg:p-8">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}
