import { describe, expect, test } from "vitest";

import { Hono } from "hono";

import { apiCors } from "../src/cors";

const webOrigin = "https://mana-vault-web-staging.pandaverse.workers.dev";

describe("API CORS", () => {
  test("allows the oRPC resume header required by the sync stream", async () => {
    const app = new Hono();
    app.use("/*", apiCors(webOrigin));
    app.post("/rpc/sync/stream", (context) => context.body(null));

    const response = await app.request("/rpc/sync/stream", {
      method: "OPTIONS",
      headers: {
        Origin: webOrigin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-orpc-last-event-id",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(webOrigin);
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect(response.headers.get("Access-Control-Allow-Headers")?.toLowerCase()).toContain(
      "x-orpc-last-event-id",
    );
  });
});
