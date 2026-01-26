import {
  Link,
  Outlet,
  createFileRoute,
  linkOptions,
  redirect,
  useMatchRoute,
  useNavigate,
} from "@tanstack/react-router";
import { ChartColumnBig, Layers, ListChecks, LogOut, Settings, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

import { authClient } from "@/lib/auth-client";
import { DbProvider } from "@/lib/db/db-context";
import { getOrCreateDb } from "@/lib/db/db";
import { executeInitialSync } from "@/lib/db/replication";
import { cn } from "@/lib/utils";
import { client } from "@/utils/orpc";

const ADMIN_EMAIL = "jesse@thecarters.cloud";

export const Route = createFileRoute("/(app)/_authed")({
  component: AuthedLayout,
  beforeLoad: async ({ context: { queryClient, orpc } }) => {
    // First fetch session (always fresh on first load, then cached until expiry)
    const session = await queryClient.fetchQuery({
      queryKey: ["session"],
      queryFn: () => authClient.getSession(),
      staleTime: (query: {
        state: { data?: Awaited<ReturnType<typeof authClient.getSession>> };
      }) => {
        const data = query.state.data;
        if (!data?.data?.session?.expiresAt) return 0;
        // Cache until 10 seconds before session expires
        const bufferMs = 10 * 1000;
        return new Date(data.data.session.expiresAt).getTime() - Date.now() - bufferMs;
      },
    });

    if (!session.data) {
      throw redirect({
        to: "/login",
      });
    }

    const customerState = await queryClient.ensureQueryData({
      queryKey: ["customerState"],
      queryFn: () => authClient.customer.state().then((res) => res.data),
    });

    const db = await getOrCreateDb();

    await queryClient.ensureQueryData({
      queryKey: ["initialSync"],
      queryFn: async () => {
        await executeInitialSync(db.rxdb, client);
        return { success: true };
      },

      staleTime: Infinity,
    });

    return { session: session.data, customerState, db };
  },
});

const navItems = linkOptions([
  { to: "/cards", label: "Collection", icon: ChartColumnBig },
  // { to: "/search", label: "Search", icon: Search },
  { to: "/decks", label: "Decks", icon: Layers },
  { to: "/lists", label: "Lists", icon: ListChecks },
]);

const adminNavItem = linkOptions([{ to: "/admin", label: "Admin", icon: Settings }])[0]!;

function AuthedLayout() {
  const { session, db } = Route.useRouteContext();
  const matchRoute = useMatchRoute();
  const navigate = useNavigate();
  const isAdmin = session.user.email === ADMIN_EMAIL;

  const handleSignOut = () => {
    authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          navigate({ to: "/login" });
        },
      },
    });
  };

  return (
    <DbProvider db={db}>
      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
        {/* Desktop Sidebar - hidden on mobile */}
        <aside className="hidden w-64 shrink-0 flex-col border-r bg-sidebar md:flex">
          {/* Logo/Brand */}
          <div className="flex items-center gap-2 border-b p-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
              M
            </div>
            <span className="font-semibold text-lg">ManaVault</span>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-2">
            <ul className="space-y-1">
              {navItems.map((item) => {
                const isActive = matchRoute({ to: item.to, fuzzy: true });
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
                      )}
                    >
                      <item.icon className="h-5 w-5" />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
              {isAdmin && (
                <li>
                  <Link
                    to={adminNavItem.to}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      matchRoute({ to: adminNavItem.to, fuzzy: true })
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground",
                    )}
                  >
                    <adminNavItem.icon className="h-5 w-5" />
                    {adminNavItem.label}
                  </Link>
                </li>
              )}
            </ul>
          </nav>

          {/* User info at bottom */}
          <div className="border-t p-4">
            <Popover>
              <PopoverTrigger className="flex w-full cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors hover:bg-accent">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 truncate text-left">
                  <div className="truncate text-sm font-medium">{session.user.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{session.user.email}</div>
                </div>
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="w-56">
                <PopoverHeader>
                  <PopoverTitle>Account</PopoverTitle>
                </PopoverHeader>
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full justify-start"
                  onClick={handleSignOut}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign Out
                </Button>
              </PopoverContent>
            </Popover>
          </div>
        </aside>

        {/* Main content area */}
        <main className="flex-1 overflow-auto pb-16 md:pb-0">
          <Outlet />
        </main>

        {/* Mobile Bottom Navigation - hidden on desktop */}
        <nav className="fixed inset-x-0 bottom-0 border-t bg-background md:hidden">
          <ul className="flex h-16 items-center justify-around">
            {navItems.map((item) => {
              const isActive = matchRoute({ to: item.to, fuzzy: true });
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={cn(
                      "flex flex-col items-center gap-1 px-4 py-2 text-xs transition-colors",
                      isActive ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
            {isAdmin && (
              <li>
                <Link
                  to={adminNavItem.to}
                  className={cn(
                    "flex flex-col items-center gap-1 px-4 py-2 text-xs transition-colors",
                    matchRoute({ to: adminNavItem.to, fuzzy: true })
                      ? "text-primary"
                      : "text-muted-foreground",
                  )}
                >
                  <adminNavItem.icon className="h-5 w-5" />
                  <span>{adminNavItem.label}</span>
                </Link>
              </li>
            )}
            <li>
              <Popover>
                <PopoverTrigger className="flex flex-col items-center gap-1 px-4 py-2 text-xs text-muted-foreground transition-colors">
                  <User className="h-5 w-5" />
                  <span>Account</span>
                </PopoverTrigger>
                <PopoverContent side="top" align="end" className="w-56">
                  <PopoverHeader>
                    <PopoverTitle>{session.user.name}</PopoverTitle>
                    <p className="text-muted-foreground">{session.user.email}</p>
                  </PopoverHeader>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full justify-start"
                    onClick={handleSignOut}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign Out
                  </Button>
                </PopoverContent>
              </Popover>
            </li>
          </ul>
        </nav>
      </div>
    </DbProvider>
  );
}
