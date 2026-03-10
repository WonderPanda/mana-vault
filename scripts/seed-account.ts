/**
 * Seeds a test account via Better-Auth's signup endpoint.
 *
 * Usage: bun run scripts/seed-account.ts [--port <n>] [--wait]
 *
 * Options:
 *   --port <n>  Override server port (default: DEV_SERVER_PORT env or 3002)
 *   --wait      Poll until the server is ready before seeding (30s timeout)
 */

import { config } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";

// Load .env.worktree if present (for dynamic worktree ports)
const worktreeEnv = resolve(import.meta.dirname, "..", ".env.worktree");
if (existsSync(worktreeEnv)) {
  config({ path: worktreeEnv });
}

const TEST_ACCOUNT = {
  name: "Jesse",
  email: "jesse@thecarters.cloud",
  password: "Password1!",
};

const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const port = getArg("--port") ?? process.env.DEV_SERVER_PORT ?? "3002";
const shouldWait = args.includes("--wait");
const baseUrl = `http://localhost:${port}`;

console.log(`Using server URL: ${baseUrl}`);

async function waitForServer(url: string, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // server not up yet
    }
    await Bun.sleep(1000);
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs / 1000}s`);
}

async function seedAccount() {
  if (shouldWait) {
    console.log(`Waiting for server at ${baseUrl}...`);
    await waitForServer(baseUrl);
    console.log("Server is ready.");
  }

  const signupUrl = `${baseUrl}/api/auth/sign-up/email`;
  console.log(`Seeding account: ${TEST_ACCOUNT.email}`);

  const res = await fetch(signupUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(TEST_ACCOUNT),
  });

  if (res.ok) {
    console.log("Account created successfully.");
    return;
  }

  const body = await res.text();

  // Account already exists — treat as success
  if (res.status === 422 || body.includes("already") || body.includes("UNIQUE")) {
    console.log("Account already exists, skipping.");
    return;
  }

  console.error(`Seed failed (${res.status}): ${body}`);
  process.exit(1);
}

seedAccount().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
