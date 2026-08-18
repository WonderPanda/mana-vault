import type {
  MultiplexedStreamEvent,
  SyncEntityType,
  SyncEventBus,
  SyncEventMap,
  SyncEventSubscriptionOptions,
} from "@mana-vault/api/publishers/sync-event-bus";

import {
  DurablePublisher,
  PublisherDurableObject,
} from "@orpc/experimental-publisher-durable-object";

type SyncChannels = Record<string, MultiplexedStreamEvent>;

const resumeRetentionSeconds = 2 * 60;

/**
 * Cloudflare Durable Object that coordinates all live sync subscribers for one
 * publisher channel. DurablePublisher maps each user ID to a separate instance.
 */
export class SyncPublisherDurableObject extends PublisherDurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env, {
      resume: {
        retentionSeconds: resumeRetentionSeconds,
      },
    });
  }
}

class DurableSyncEventBus implements SyncEventBus {
  private readonly publisher: DurablePublisher<SyncChannels>;

  constructor(namespace: DurableObjectNamespace<SyncPublisherDurableObject>) {
    this.publisher = new DurablePublisher(namespace, {
      prefix: "sync:",
    });
  }

  publish<Type extends SyncEntityType>(
    userId: string,
    type: Type,
    event: SyncEventMap[Type],
  ): Promise<void> {
    return this.publisher.publish(userId, { type, event } as MultiplexedStreamEvent);
  }

  subscribe(
    userId: string,
    options?: SyncEventSubscriptionOptions,
  ): AsyncIterable<MultiplexedStreamEvent> {
    return this.publisher.subscribe(userId, options);
  }
}

export function createDurableSyncEventBus(
  namespace: DurableObjectNamespace<SyncPublisherDurableObject>,
): SyncEventBus {
  return new DurableSyncEventBus(namespace);
}
