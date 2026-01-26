import { createRxDatabase } from "rxdb/plugins/core";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import { createCollection } from "@tanstack/react-db";
import { rxdbCollectionOptions } from "@tanstack/rxdb-db-collection";

import type { RxCollection, RxDatabase, RxJsonSchema } from "rxdb";

// =============================================================================
// Schema Definitions
// =============================================================================

const scryfallCardSchema: RxJsonSchema<ScryfallCardDoc> = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 36 }, // Scryfall UUID
    oracleId: { type: "string" },
    name: { type: "string" },
    setCode: { type: "string" },
    setName: { type: "string" },
    collectorNumber: { type: "string" },
    rarity: { type: "string" }, // common, uncommon, rare, mythic
    manaCost: { type: ["string", "null"] },
    cmc: { type: ["number", "null"] },
    typeLine: { type: ["string", "null"] },
    oracleText: { type: ["string", "null"] },
    colors: { type: ["string", "null"] }, // JSON array as string
    colorIdentity: { type: ["string", "null"] }, // JSON array as string
    imageUri: { type: ["string", "null"] },
    scryfallUri: { type: ["string", "null"] },
    dataJson: { type: ["string", "null"] }, // Full Scryfall JSON for additional fields
    createdAt: { type: "number" },
    updatedAt: { type: "number" },
  },
  required: [
    "id",
    "oracleId",
    "name",
    "setCode",
    "setName",
    "collectorNumber",
    "rarity",
    "createdAt",
    "updatedAt",
  ],
  indexes: ["oracleId", "name", "setCode"],
};

const deckSchema: RxJsonSchema<DeckDoc> = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 36 },
    userId: { type: "string" },
    name: { type: "string" },
    format: { type: "string" }, // commander, standard, modern, legacy, pioneer, pauper, other
    status: { type: "string" }, // active, retired, in_progress, theorycraft
    archetype: { type: ["string", "null"] }, // aggro, control, combo, midrange, tempo, other
    colorIdentity: { type: ["string", "null"] }, // JSON array as string
    description: { type: ["string", "null"] },
    isPublic: { type: "boolean" },
    sortOrder: { type: "number" },
    createdAt: { type: "number" },
    updatedAt: { type: "number" },
  },
  required: [
    "id",
    "userId",
    "name",
    "format",
    "status",
    "isPublic",
    "sortOrder",
    "createdAt",
    "updatedAt",
  ],
  indexes: ["userId", ["userId", "status"], ["userId", "format"]],
};

const deckCardSchema: RxJsonSchema<DeckCardDoc> = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 36 },
    deckId: { type: "string" },
    oracleId: { type: "string" }, // Card concept (any printing)
    preferredScryfallId: { type: ["string", "null"] }, // Preferred printing (optional)
    quantity: { type: "number" },
    board: { type: "string" }, // main, sideboard, maybeboard
    isCommander: { type: "boolean" },
    isCompanion: { type: "boolean" },
    collectionCardId: { type: ["string", "null"] }, // Link to owned copy
    isProxy: { type: "boolean" },
    sortOrder: { type: "number" },
    createdAt: { type: "number" },
    updatedAt: { type: "number" },
  },
  required: [
    "id",
    "deckId",
    "oracleId",
    "quantity",
    "board",
    "isCommander",
    "isCompanion",
    "isProxy",
    "sortOrder",
    "createdAt",
    "updatedAt",
  ],
  indexes: ["deckId", "oracleId", ["deckId", "isCommander"]],
};

// =============================================================================
// TypeScript Types
// =============================================================================

export interface ScryfallCardDoc {
  id: string;
  oracleId: string;
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  rarity: string;
  manaCost: string | null;
  cmc: number | null;
  typeLine: string | null;
  oracleText: string | null;
  colors: string | null;
  colorIdentity: string | null;
  imageUri: string | null;
  scryfallUri: string | null;
  dataJson: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface DeckDoc {
  id: string;
  userId: string;
  name: string;
  format: string;
  status: string;
  archetype: string | null;
  colorIdentity: string | null;
  description: string | null;
  isPublic: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface DeckCardDoc {
  id: string;
  deckId: string;
  oracleId: string;
  preferredScryfallId: string | null;
  quantity: number;
  board: string;
  isCommander: boolean;
  isCompanion: boolean;
  collectionCardId: string | null;
  isProxy: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

// =============================================================================
// Database Types
// =============================================================================

export type DatabaseCollections = {
  scryfall_cards: RxCollection<ScryfallCardDoc>;
  decks: RxCollection<DeckDoc>;
  deck_cards: RxCollection<DeckCardDoc>;
};

export type ManaVaultDatabase = RxDatabase<DatabaseCollections>;

// =============================================================================
// Database Instance
// =============================================================================

let db: ManaVaultDatabase | null = null;

export async function getOrCreateDb() {
  if (db) {
    return db;
  }

  const database = await createRxDatabase<DatabaseCollections>({
    name: "mana_vault_db",
    storage: getRxStorageDexie(),
  });

  await database.addCollections({
    scryfall_cards: {
      schema: scryfallCardSchema,
    },
    decks: {
      schema: deckSchema,
    },
    deck_cards: {
      schema: deckCardSchema,
    },
  });

  db = database;

  const deckCollection = createCollection(
    rxdbCollectionOptions({
      rxCollection: db.decks,
    }),
  );

  const deckCardCollection = createCollection(
    rxdbCollectionOptions({
      rxCollection: db.deck_cards,
    }),
  );

  const scryfallCardCollection = createCollection(
    rxdbCollectionOptions({
      rxCollection: db.scryfall_cards,
    }),
  );

  return {
    rxdb: db,
    deckCollection,
    deckCardCollection,
    scryfallCardCollection,
  };
}
