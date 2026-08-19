import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export default function buildWorkerFixtures() {
  const appDirectory = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

  execFileSync(
    "bun",
    [
      "build",
      "test/fixtures/sync-ingress-worker.ts",
      "test/fixtures/sync-publisher-owner.ts",
      "--outdir",
      "test/.dist",
      "--target",
      "browser",
      "--format",
      "esm",
      "--external",
      "cloudflare:workers",
    ],
    { cwd: appDirectory, stdio: "inherit" },
  );
}
