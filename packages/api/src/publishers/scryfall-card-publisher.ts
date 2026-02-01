import { EventPublisher } from "@orpc/server";

import type { ScryfallCardReplicationDoc, ReplicationCheckpoint } from "./replication-types";
import { toReplicationDoc } from "./to-replication-doc";

// Re-export types for consumers
export type { ScryfallCardReplicationDoc } from "./replication-types";

export type ScryfallCardStreamEvent =
  | {
      documents: ScryfallCardReplicationDoc[];
      checkpoint: ReplicationCheckpoint | null;
    }
  | "RESYNC";

export const scryfallCardPublisher = new EventPublisher<Record<string, ScryfallCardStreamEvent>>();

export function toScryfallCardReplicationDoc(
  doc: {
    id: string;
    oracleId: string;
    name: string;
    setCode: string;
    setName: string;
    collectorNumber: string;
    rarity: string;
    manaCost: string | null;
    cmc: number;
    typeLine: string | null;
    oracleText: string | null;
    colors: string | null;
    colorIdentity: string | null;
    imageUri: string | null;
    scryfallUri: string | null;
    priceUsd: number | null;
    priceUsdFoil: number | null;
    priceUsdEtched: number | null;
    dataJson: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  deleted = false,
): ScryfallCardReplicationDoc {
  return toReplicationDoc(doc, ["createdAt", "updatedAt"], deleted) as ScryfallCardReplicationDoc;
}
