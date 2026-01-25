import alchemy from "alchemy";
import { Vite } from "alchemy/cloudflare";
import { Worker } from "alchemy/cloudflare";
import { D1Database, R2Bucket } from "alchemy/cloudflare";
import { CloudflareStateStore } from "alchemy/state";
import { z } from "zod";

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
  bindings: {
    DB: db,
    CORS_ORIGIN: alchemy.env.CORS_ORIGIN!,
    BETTER_AUTH_SECRET: alchemy.secret.env.BETTER_AUTH_SECRET!,
    BETTER_AUTH_URL: alchemy.env.BETTER_AUTH_URL!,
    POLAR_ACCESS_TOKEN: alchemy.secret.env.POLAR_ACCESS_TOKEN!,
    POLAR_SUCCESS_URL: alchemy.env.POLAR_SUCCESS_URL!,
    SCRYFALL_DATA: scryfallDataBucket,
  },
  dev: {
    port: 3000,
  },
});

console.log(`Web    -> ${web.url}`);
console.log(`Server -> ${server.url}`);

await app.finalize();
