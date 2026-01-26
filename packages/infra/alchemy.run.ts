import alchemy from "alchemy";
import { Vite } from "alchemy/cloudflare";
import { Worker } from "alchemy/cloudflare";
import { D1Database, Queue, R2Bucket } from "alchemy/cloudflare";
import { CloudflareStateStore } from "alchemy/state";
import { z } from "zod";

/**
 * Message types for queues.
 * These types are duplicated in @mana-vault/api/types/queue-messages.ts
 * to avoid circular dependencies.
 */
type ScryfallImportMessage = {
  type: "scryfall-import";
  bulkDataType: "oracle_cards" | "unique_artwork" | "default_cards" | "all_cards";
  englishOnly: boolean;
  downloadUri: string;
};

type ScryfallInsertBatchMessage = {
  type: "scryfall-insert-batch";
  batchNumber: number;
  r2Key: string;
};

const envSchema = z.object({
  ALCHEMY_STAGE: z.string().default("local"),
});

const env = envSchema.parse(process.env);
const stage = env.ALCHEMY_STAGE;

const app = await alchemy("mana-vault", {
  stage,
  stateStore:
    stage === "local"
      ? undefined
      : (scope) => new CloudflareStateStore(scope, { forceUpdate: true }),
});

const db = await D1Database("database", {
  migrationsDir: "../../packages/db/src/migrations",
});

const scryfallDataBucket = await R2Bucket("scryfall-data", {
  name: "scryfall-data",
});

// Stage 1: Parse queue - downloads/reads bulk data and dispatches batches
export const scryfallImportQueue = await Queue<ScryfallImportMessage>("scryfall-import-queue");

// Stage 2: Insert queue - receives batches and inserts into DB
export const scryfallInsertQueue = await Queue<ScryfallInsertBatchMessage>("scryfall-insert-queue");

export const web = await Vite("web", {
  cwd: "../../apps/web",
  assets: "dist",
  bindings: {
    VITE_SERVER_URL: alchemy.env.VITE_SERVER_URL!,
  },
});

export const server = await Worker("server", {
  cwd: "../../apps/server",
  entrypoint: "src/index.ts",
  compatibility: "node",
  limits: {
    cpu_ms: 300_000,
  },
  bindings: {
    DB: db,
    CORS_ORIGIN: alchemy.env.CORS_ORIGIN!,
    BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET!,
    BETTER_AUTH_URL: alchemy.env.BETTER_AUTH_URL!,
    POLAR_ACCESS_TOKEN: alchemy.secret.env.POLAR_ACCESS_TOKEN!,
    POLAR_SUCCESS_URL: alchemy.env.POLAR_SUCCESS_URL!,
    SCRYFALL_DATA: scryfallDataBucket,
    SCRYFALL_IMPORT_QUEUE: scryfallImportQueue,
    SCRYFALL_INSERT_QUEUE: scryfallInsertQueue,
  },
  // Register as consumer of both queues
  eventSources: [
    {
      // Stage 1: Parse queue - single worker parses and dispatches
      queue: scryfallImportQueue,
      settings: {
        batchSize: 1, // Process one import job at a time
        maxRetries: 3,
        maxWaitTimeMs: 1000,
      },
    },
    {
      // Stage 2: Insert queue - parallel workers insert batches
      queue: scryfallInsertQueue,
      settings: {
        batchSize: 1, // Process one batch per invocation
        maxConcurrency: 5, // Allow 5 parallel insert workers
        maxRetries: 3,
        maxWaitTimeMs: 500,
      },
    },
  ],
  dev: {
    port: 3000,
  },
});

console.log(`Web    -> ${web.url}`);
console.log(`Server -> ${server.url}`);

await app.finalize();
