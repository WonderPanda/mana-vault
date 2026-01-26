import type {
  ScryfallImportMessage,
  ScryfallInsertBatchMessage,
} from "@mana-vault/api/types/queue-messages";
import { createContext } from "@mana-vault/api/context";
import { appRouter } from "@mana-vault/api/routers/index";
import { auth } from "@mana-vault/auth";
import { env } from "@mana-vault/env/server";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { handleScryfallImport, handleScryfallInsertBatch } from "./queue-handlers/scryfall-import";

/** Union type for all queue messages this worker handles */
type QueueMessage = ScryfallImportMessage | ScryfallInsertBatchMessage;

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

export const apiHandler = new OpenAPIHandler(appRouter, {
  plugins: [
    new OpenAPIReferencePlugin({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    }),
  ],
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

export const rpcHandler = new RPCHandler(appRouter, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

app.use("/*", async (c, next) => {
  const context = await createContext({ context: c });

  const rpcResult = await rpcHandler.handle(c.req.raw, {
    prefix: "/rpc",
    context: context,
  });

  if (rpcResult.matched) {
    return c.newResponse(rpcResult.response.body, rpcResult.response);
  }

  const apiResult = await apiHandler.handle(c.req.raw, {
    prefix: "/api-reference",
    context: context,
  });

  if (apiResult.matched) {
    return c.newResponse(apiResult.response.body, apiResult.response);
  }

  await next();
});

app.get("/", (c) => {
  return c.text("OK");
});

export default {
  fetch: app.fetch,

  /**
   * Queue handler for processing Scryfall jobs.
   * Handles both Stage 1 (parse & dispatch) and Stage 2 (insert batch) messages.
   */
  async queue(batch: MessageBatch<QueueMessage>, workerEnv: typeof env): Promise<void> {
    for (const message of batch.messages) {
      try {
        const { type } = message.body;
        console.log(`[Queue] Processing message: ${type}`);

        if (type === "scryfall-import") {
          // Stage 1: Parse bulk data and dispatch batches to insert queue
          await handleScryfallImport(
            message.body,
            workerEnv.SCRYFALL_DATA,
            workerEnv.SCRYFALL_INSERT_QUEUE,
          );
        } else if (type === "scryfall-insert-batch") {
          // Stage 2: Download batch from R2 and insert into database
          await handleScryfallInsertBatch(message.body, workerEnv.SCRYFALL_DATA);
        } else {
          console.warn(`[Queue] Unknown message type: ${type}`);
        }

        message.ack();
        console.log(`[Queue] Message processed successfully`);
      } catch (error) {
        console.error(`[Queue] Error processing message:`, error);
        // Message will be retried based on queue settings
        message.retry();
      }
    }
  },
};
