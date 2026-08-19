import { env } from "cloudflare:workers";
import { describe, expect, test } from "vitest";

interface TestServices {
  SYNC_PUBLISHER: Fetcher;
  SYNC_SUBSCRIBER: Fetcher;
}

describe("durable sync event backbone", () => {
  test("an event published by one Worker reaches a subscriber in another Worker", async () => {
    const services = env as unknown as TestServices;
    const userId = `user-${crypto.randomUUID()}`;
    const event = {
      documents: [],
      checkpoint: { id: "tag-1", updatedAt: 123 },
    };

    const receivedEvent = services.SYNC_SUBSCRIBER.fetch(
      `https://subscriber.test/next?userId=${userId}`,
    );
    const publishResponse = await services.SYNC_PUBLISHER.fetch(
      `https://publisher.test/publish-tag?userId=${userId}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      },
    );

    expect(publishResponse.status).toBe(204);

    const subscriptionResponse = await receivedEvent;
    expect(subscriptionResponse.status).toBe(200);
    expect(subscriptionResponse.headers.get("x-test-worker-instance")).not.toBe(
      publishResponse.headers.get("x-test-worker-instance"),
    );
    expect(await subscriptionResponse.json()).toEqual({ type: "tag", event });
  });

  test("a virtual-list change reaches only subscribers on the same user channel", async () => {
    const services = env as unknown as TestServices;
    const userId = `user-${crypto.randomUUID()}`;
    const otherUserId = `user-${crypto.randomUUID()}`;
    const event = { listId: "list-1", kind: "cardsChanged" };

    const receivedEvent = services.SYNC_SUBSCRIBER.fetch(
      `https://subscriber.test/next?userId=${userId}`,
    );
    const otherUserEvent = services.SYNC_SUBSCRIBER.fetch(
      `https://subscriber.test/next?userId=${otherUserId}`,
    );
    const publishResponse = await services.SYNC_PUBLISHER.fetch(
      `https://publisher.test/publish-virtual-list?userId=${userId}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event),
      },
    );

    expect(publishResponse.status).toBe(204);

    const subscriptionResponse = await receivedEvent;
    expect(subscriptionResponse.status).toBe(200);
    expect(subscriptionResponse.headers.get("x-test-worker-instance")).not.toBe(
      publishResponse.headers.get("x-test-worker-instance"),
    );
    expect(await subscriptionResponse.json()).toEqual({ type: "virtualList", event });

    const otherUserResponse = await otherUserEvent;
    expect(otherUserResponse.status).toBe(504);
  });
});
