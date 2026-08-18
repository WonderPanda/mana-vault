import type { Context as HonoContext } from "hono";

import { auth } from "@mana-vault/auth";
import { env } from "@mana-vault/env/server";

import type { ScryfallImportMessage } from "./types/queue-messages";
import type { SyncEventBus } from "./publishers/sync-event-bus";

export type CreateContextOptions = {
  context: HonoContext;
  syncEvents: SyncEventBus;
};

export async function createContext({ context, syncEvents }: CreateContextOptions) {
  const session = await auth.api.getSession({
    headers: context.req.raw.headers,
  });

  // Get the scryfall import queue from env bindings
  const scryfallImportQueue = env.SCRYFALL_IMPORT_QUEUE as Queue<ScryfallImportMessage> | undefined;

  return {
    session,
    scryfallImportQueue,
    syncEvents,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
