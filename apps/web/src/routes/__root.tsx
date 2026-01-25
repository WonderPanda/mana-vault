import type { AppRouterClient } from "@mana-vault/api/routers/index";
import type { QueryClient } from "@tanstack/react-query";

import { createORPCClient } from "@orpc/client";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { HeadContent, Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { useCallback, useEffect, useRef, useState } from "react";

import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { link, orpc } from "@/utils/orpc";

import "../index.css";

export interface RouterAppContext {
  orpc: typeof orpc;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "mana-vault",
      },
      {
        name: "description",
        content: "mana-vault is a web application",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
  }),
});

function useRapidClickToggle(clickCount = 5, timeWindow = 1000) {
  const [isVisible, setIsVisible] = useState(false);
  const clickTimestamps = useRef<number[]>([]);

  const handleClick = useCallback(() => {
    const now = Date.now();
    clickTimestamps.current.push(now);

    // Keep only clicks within the time window
    clickTimestamps.current = clickTimestamps.current.filter(
      (timestamp) => now - timestamp < timeWindow,
    );

    if (clickTimestamps.current.length >= clickCount) {
      setIsVisible((prev) => !prev);
      clickTimestamps.current = [];
    }
  }, [clickCount, timeWindow]);

  useEffect(() => {
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, [handleClick]);

  return isVisible;
}

function RootComponent() {
  const [client] = useState<AppRouterClient>(() => createORPCClient(link));
  const [orpcUtils] = useState(() => createTanstackQueryUtils(client));
  const showDevtools = useRapidClickToggle(3, 1000);

  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        <div className="flex h-svh flex-col">
          <Outlet />
        </div>
        <Toaster richColors />
      </ThemeProvider>
      {showDevtools && (
        <>
          <TanStackRouterDevtools position="bottom-left" />
          <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
        </>
      )}
    </>
  );
}
