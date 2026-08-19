import type { SyncEventBus, SyncEventMap } from "@mana-vault/api/publishers/sync-event-bus";

import { createDurableSyncEventBus } from "../../src/sync-events";
import type { SyncPublisherDurableObject } from "../../src/sync-events";

interface TestEnv {
  SYNC_PUBLISHER_DO: DurableObjectNamespace<SyncPublisherDurableObject>;
  TEST_WORKER_NAME: string;
}

async function waitForNextEvent(
  eventBus: SyncEventBus,
  userId: string,
  workerName: string,
): Promise<Response> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), 500);

  try {
    const iterator = eventBus
      .subscribe(userId, {
        signal: abortController.signal,
        lastEventId: "0",
      })
      [Symbol.asyncIterator]();
    const result = await iterator.next();

    if (result.done) {
      return new Response("Subscription ended before receiving an event", { status: 500 });
    }

    return Response.json(result.value, {
      headers: { "x-test-worker-instance": workerName },
    });
  } catch (error) {
    if (abortController.signal.aborted) {
      return new Response("Timed out waiting for a sync event", { status: 504 });
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId");

    if (!userId) {
      return new Response("Missing userId", { status: 400 });
    }

    const eventBus = createDurableSyncEventBus(env.SYNC_PUBLISHER_DO);

    if (request.method === "GET" && url.pathname === "/next") {
      return waitForNextEvent(eventBus, userId, env.TEST_WORKER_NAME);
    }

    if (request.method === "POST" && url.pathname === "/publish-tag") {
      const event = await request.json<SyncEventMap["tag"]>();
      await eventBus.publish(userId, "tag", event);
      return new Response(null, {
        status: 204,
        headers: { "x-test-worker-instance": env.TEST_WORKER_NAME },
      });
    }

    if (request.method === "POST" && url.pathname === "/publish-virtual-list") {
      const event = await request.json<SyncEventMap["virtualList"]>();
      await eventBus.publish(userId, "virtualList", event);
      return new Response(null, {
        status: 204,
        headers: { "x-test-worker-instance": env.TEST_WORKER_NAME },
      });
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<TestEnv>;
