import type { AppRouterClient } from "@mana-vault/api/routers/index";
import type { ClientRetryPluginContext } from "@orpc/client/plugins";

import { env } from "@mana-vault/env/web";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { ClientRetryPlugin } from "@orpc/client/plugins";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 1, // 1 minutes - prevents refetching on every navigation/hover
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      toast.error(`Error: ${error.message}`, {
        action: {
          label: "retry",
          onClick: query.invalidate,
        },
      });
    },
  }),
});

export type WebAppRouterClient = AppRouterClient<ClientRetryPluginContext>;

export const link = new RPCLink<ClientRetryPluginContext>({
  url: `${env.VITE_SERVER_URL}/rpc`,
  plugins: [new ClientRetryPlugin()],
  fetch(url, options) {
    return fetch(url, {
      ...options,
      credentials: "include",
    });
  },
});

export const client: WebAppRouterClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
