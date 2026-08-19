import type { TagReplicationDoc, ReplicationCheckpoint } from "./replication-types";
import { toReplicationDoc } from "./to-replication-doc";

// Re-export types for consumers
export type { TagReplicationDoc } from "./replication-types";

export type TagStreamEvent = {
  documents: TagReplicationDoc[];
  checkpoint: ReplicationCheckpoint | null;
};

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
  return toReplicationDoc(doc, ["createdAt", "updatedAt"], deleted) as TagReplicationDoc;
}
