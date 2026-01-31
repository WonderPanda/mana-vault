import { EventPublisher } from "@orpc/server";

// =============================================================================
// Tag Replication Types
// =============================================================================

export interface TagReplicationDoc {
  id: string;
  name: string;
  color: string | null;
  isSystem: boolean;
  createdAt: number;
  updatedAt: number;
  _deleted: boolean;
}

export interface TagReplicationCheckpoint {
  id: string;
  updatedAt: number;
}

export type TagStreamEvent = {
  documents: TagReplicationDoc[];
  checkpoint: TagReplicationCheckpoint | null;
};

export const tagPublisher = new EventPublisher<Record<string, TagStreamEvent>>();

export function toTagReplicationDoc(
  doc: {
    id: string;
    name: string;
    color: string | null;
    isSystem: boolean;
    createdAt: Date;
    updatedAt: Date;
  },
  deleted = false,
): TagReplicationDoc {
  return {
    id: doc.id,
    name: doc.name,
    color: doc.color,
    isSystem: doc.isSystem,
    createdAt: doc.createdAt.getTime(),
    updatedAt: doc.updatedAt.getTime(),
    _deleted: deleted,
  };
}
