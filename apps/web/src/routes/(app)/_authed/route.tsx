import {
  Link,
  Outlet,
  createFileRoute,
  linkOptions,
  redirect,
  useMatchRoute,
} from "@tanstack/react-router";
import { ChartColumnBig, Layers, ListChecks, Search, User } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/(app)/_authed")({
  component: AuthedLayout,
  beforeLoad: async ({ context: { queryClient } }) => {
    // First fetch session (always fresh on first load, then cached until expiry)
    const session = await queryClient.fetchQuery({
      queryKey: ["session"],
      queryFn: () => authClient.getSession(),
      staleTime: (query) => {
        const data = query.state.data;
        if (!data?.data?.session?.expiresAt) return 0;
        // Cache until 10 seconds before session expires
        const bufferMs = 10 * 1000;
        return (
          new Date(data.data.session.expiresAt).getTime() -
          Date.now() -
          bufferMs
        );
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

    return { session: session.data, customerState };
  },
});

const navItems = linkOptions([
  { to: "/cards", label: "Collection", icon: ChartColumnBig },
  { to: "/search", label: "Search", icon: Search },
  { to: "/decks", label: "Decks", icon: Layers },
  { to: "/lists", label: "Lists", icon: ListChecks },
]);

function AuthedLayout() {
  const { session } = Route.useRouteContext();
  const matchRoute = useMatchRoute();

  return (
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
          </ul>
        </nav>

        {/* User info at bottom */}
        <div className="border-t p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
              <User className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 truncate">
              <div className="truncate text-sm font-medium">
                {session.user.name}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {session.user.email}
              </div>
            </div>
          </div>
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
        </ul>
      </nav>
    </div>
  );
}
