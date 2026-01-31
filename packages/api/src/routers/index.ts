import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { adminRouter } from "./admin";
import { cardsRouter } from "./cards";
import { collectionsRouter } from "./collections";
import { decksRouter } from "./decks";
import { listsRouter } from "./lists";
import { syncRouter } from "./sync";
import { tagsRouter } from "./tags";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  privateData: protectedProcedure.handler(({ context }) => {
    return {
      message: "This is private",
      user: context.session?.user,
    };
  }),
  admin: adminRouter,
  cards: cardsRouter,
  collections: collectionsRouter,
  decks: decksRouter,
  lists: listsRouter,
  sync: syncRouter,
  tags: tagsRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
