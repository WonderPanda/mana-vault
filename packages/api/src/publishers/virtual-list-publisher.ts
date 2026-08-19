import type { SyncEventBus } from "./sync-event-bus";

export type VirtualListChangeKind = "created" | "updated" | "deleted" | "cardsChanged";

export interface VirtualListChangeEvent {
  listId: string;
  kind: VirtualListChangeKind;
}

export function publishVirtualListChange(
  eventBus: SyncEventBus,
  userId: string,
  listId: string,
  kind: VirtualListChangeKind,
): Promise<void> {
  return eventBus.publish(userId, "virtualList", { listId, kind });
}
