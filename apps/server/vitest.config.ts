import path from "node:path";
import { fileURLToPath } from "node:url";

import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const appDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixtureBuildDirectory = path.join(appDirectory, "test/.dist");
const compatibilityDate = "2026-04-01";

const publisherDurableObject = {
  className: "SyncPublisherDurableObject",
  scriptName: "sync-publisher-owner",
  useSQLite: true,
};

function ingressWorker(name: string) {
  return {
    name,
    modules: true,
    scriptPath: path.join(fixtureBuildDirectory, "sync-ingress-worker.js"),
    compatibilityDate,
    compatibilityFlags: ["nodejs_compat", "enable_request_signal"],
    bindings: { TEST_WORKER_NAME: name },
    durableObjects: {
      SYNC_PUBLISHER_DO: publisherDurableObject,
    },
  } as const;
}

export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate,
        compatibilityFlags: ["enable_request_signal"],
        serviceBindings: {
          SYNC_SUBSCRIBER: "sync-ingress-a",
          SYNC_PUBLISHER: "sync-ingress-b",
        },
        workers: [
          {
            name: "sync-publisher-owner",
            modules: true,
            scriptPath: path.join(fixtureBuildDirectory, "sync-publisher-owner.js"),
            compatibilityDate,
            compatibilityFlags: ["nodejs_compat", "enable_request_signal"],
            durableObjects: {
              SYNC_PUBLISHER_DO_OWNER: {
                className: "SyncPublisherDurableObject",
                useSQLite: true,
              },
            },
          },
          ingressWorker("sync-ingress-a"),
          ingressWorker("sync-ingress-b"),
        ],
      },
    }),
  ],
  test: {
    globalSetup: ["./test/global-setup.ts"],
    include: ["test/**/*.integration.test.ts"],
    testTimeout: 10_000,
  },
});
