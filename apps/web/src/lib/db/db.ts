import { createRxDatabase, addRxPlugin } from "rxdb/plugins/core";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import { RxDBMigrationSchemaPlugin } from "rxdb/plugins/migration-schema";
import { createCollection } from "@tanstack/react-db";
import { rxdbCollectionOptions } from "@tanstack/rxdb-db-collection";

import type { RxCollection, RxDatabase, RxJsonSchema } from "rxdb";

import {
  setupDeckReplication,
  setupDeckCardReplication,
  setupScryfallCardReplication,
  setupCollectionCardReplication,
  setupCollectionCardLocationReplication,
  setupStorageContainerReplication,
} from "./replication";
import type { ReplicationCheckpoint } from "./replication";
import { client } from "@/utils/orpc";

// Add migration plugin for schema version changes
addRxPlugin(RxDBMigrationSchemaPlugin);

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
    _deleted: { type: "boolean" }, // Required for RxDB replication
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
    "_deleted",
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
    _deleted: { type: "boolean" }, // Required for RxDB replication
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
    "_deleted",
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
    _deleted: { type: "boolean" }, // Required for RxDB replication
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
    "_deleted",
  ],
  indexes: ["deckId", "oracleId", ["deckId", "isCommander"]],
};

const collectionCardSchema: RxJsonSchema<CollectionCardDoc> = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 36 },
    userId: { type: "string" },
    scryfallCardId: { type: "string" },
    condition: { type: "string" }, // NM, LP, MP, HP, DMG
    isFoil: { type: "boolean" },
    language: { type: "string" },
    notes: { type: ["string", "null"] },
    acquiredAt: { type: ["number", "null"] },
    acquiredFrom: { type: ["string", "null"] },
    status: { type: "string" }, // owned, traded, sold, lost
    removedAt: { type: ["number", "null"] },
    createdAt: { type: "number" },
    updatedAt: { type: "number" },
    _deleted: { type: "boolean" }, // Required for RxDB replication
  },
  required: [
    "id",
    "userId",
    "scryfallCardId",
    "condition",
    "isFoil",
    "language",
    "status",
    "createdAt",
    "updatedAt",
    "_deleted",
  ],
  indexes: ["userId", "scryfallCardId", ["userId", "status"], ["userId", "scryfallCardId"]],
};

const storageContainerSchema: RxJsonSchema<StorageContainerDoc> = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 36 },
    userId: { type: "string" },
    name: { type: "string" },
    type: { type: "string" }, // binder, box, deck_box, other
    description: { type: ["string", "null"] },
    sortOrder: { type: "number" },
    createdAt: { type: "number" },
    updatedAt: { type: "number" },
    _deleted: { type: "boolean" }, // Required for RxDB replication
  },
  required: ["id", "userId", "name", "type", "sortOrder", "createdAt", "updatedAt", "_deleted"],
  indexes: ["userId"],
};

const collectionCardLocationSchema: RxJsonSchema<CollectionCardLocationDoc> = {
  version: 1, // Bumped version to handle new updatedAt field
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 36 },
    collectionCardId: { type: "string" },
    storageContainerId: { type: ["string", "null"] },
    deckId: { type: ["string", "null"] },
    assignedAt: { type: "number" },
    updatedAt: { type: "number" }, // Used for sync checkpoint
    _deleted: { type: "boolean" }, // Required for RxDB replication
  },
  required: ["id", "collectionCardId", "assignedAt", "_deleted"],
  // Note: Can't index storageContainerId or deckId since they're nullable
  // RxDB requires indexed fields to be in the required array
  indexes: ["collectionCardId"],
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
  _deleted: boolean; // Required for RxDB replication
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
  _deleted: boolean; // Required for RxDB replication
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
  _deleted: boolean; // Required for RxDB replication
}

export interface CollectionCardDoc {
  id: string;
  userId: string;
  scryfallCardId: string;
  condition: string;
  isFoil: boolean;
  language: string;
  notes: string | null;
  acquiredAt: number | null;
  acquiredFrom: string | null;
  status: string;
  removedAt: number | null;
  createdAt: number;
  updatedAt: number;
  _deleted: boolean; // Required for RxDB replication
}

export interface CollectionCardLocationDoc {
  id: string;
  collectionCardId: string;
  storageContainerId: string | null;
  deckId: string | null;
  assignedAt: number;
  updatedAt?: number; // Used for sync checkpoint (optional for backwards compat)
  _deleted: boolean; // Required for RxDB replication
}

export interface StorageContainerDoc {
  id: string;
  userId: string;
  name: string;
  type: string;
  description: string | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  _deleted: boolean; // Required for RxDB replication
}

// =============================================================================
// Database Types
// =============================================================================

export type DatabaseCollections = {
  scryfall_cards: RxCollection<ScryfallCardDoc>;
  decks: RxCollection<DeckDoc>;
  deck_cards: RxCollection<DeckCardDoc>;
  collection_cards: RxCollection<CollectionCardDoc>;
  collection_card_locations: RxCollection<CollectionCardLocationDoc>;
  storage_containers: RxCollection<StorageContainerDoc>;
};

export type ManaVaultDatabase = RxDatabase<DatabaseCollections>;

// =============================================================================
// Database Instance
// =============================================================================

// =============================================================================
// Singleton State
// =============================================================================

let dbSingleton: Awaited<ReturnType<typeof initializeDb>> | null = null;

async function initializeDb() {
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
    collection_cards: {
      schema: collectionCardSchema,
    },
    collection_card_locations: {
      schema: collectionCardLocationSchema,
      // Migration from version 0 to 1: add updatedAt field (defaults to assignedAt)
      migrationStrategies: {
        1: (oldDoc) => ({
          ...oldDoc,
          updatedAt: oldDoc.updatedAt ?? oldDoc.assignedAt,
        }),
      },
    },
    storage_containers: {
      schema: storageContainerSchema,
    },
  });

  // Set up replication for all collections
  const deckReplicationState = setupDeckReplication(database, client);
  const deckCardReplicationState = setupDeckCardReplication(database, client);
  const storageContainerReplicationState = setupStorageContainerReplication(database, client);
  const collectionCardReplicationState = setupCollectionCardReplication(database, client);
  const collectionCardLocationReplicationState = setupCollectionCardLocationReplication(
    database,
    client,
  );
  const scryfallCardReplicationState = setupScryfallCardReplication(database, client);

  const deckCollection = createCollection(
    rxdbCollectionOptions({
      rxCollection: database.decks,
    }),
  );

  const deckCardCollection = createCollection(
    rxdbCollectionOptions({
      rxCollection: database.deck_cards,
    }),
  );

  const storageContainerCollection = createCollection(
    rxdbCollectionOptions({
      rxCollection: database.storage_containers,
    }),
  );

  const collectionCardCollection = createCollection(
    rxdbCollectionOptions({
      rxCollection: database.collection_cards,
    }),
  );

  const collectionCardLocationCollection = createCollection(
    rxdbCollectionOptions({
      rxCollection: database.collection_card_locations,
    }),
  );

  const scryfallCardCollection = createCollection(
    rxdbCollectionOptions({
      rxCollection: database.scryfall_cards,
    }),
  );

  return {
    rxdb: database,
    deckReplicationState,
    deckCardReplicationState,
    storageContainerReplicationState,
    collectionCardReplicationState,
    collectionCardLocationReplicationState,
    scryfallCardReplicationState,
    deckCollection,
    deckCardCollection,
    storageContainerCollection,
    collectionCardCollection,
    collectionCardLocationCollection,
    scryfallCardCollection,
  };
}

export async function getOrCreateDb() {
  if (!dbSingleton) {
    dbSingleton = await initializeDb();
  }
  return dbSingleton;
}
