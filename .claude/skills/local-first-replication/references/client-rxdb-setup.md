# RxDB Setup and Configuration (Client)

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Database Initialization](#database-initialization)
- [Schema Definition](#schema-definition)
- [TypeScript Types](#typescript-types)
- [Schema Migrations](#schema-migrations)
- [Database Singleton Pattern](#database-singleton-pattern)

## Overview

RxDB provides an offline-first reactive database using IndexedDB (via Dexie) as the storage backend. Setup steps:

1. Add RxDB plugins
2. Define JSON schemas matching server entities
3. Create TypeScript types for documents
4. Initialize database with collections
5. Export singleton accessor

## Dependencies

```bash
bun add rxdb rxjs
```

Required imports:

```typescript
import { createRxDatabase, addRxPlugin } from "rxdb/plugins/core";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import { RxDBMigrationSchemaPlugin } from "rxdb/plugins/migration-schema";

import type { RxCollection, RxDatabase, RxJsonSchema } from "rxdb";
```

## Database Initialization

```typescript
// apps/web/src/lib/db/db.ts
import { createRxDatabase, addRxPlugin } from "rxdb/plugins/core";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import { RxDBMigrationSchemaPlugin } from "rxdb/plugins/migration-schema";

// Add migration plugin for schema version changes
addRxPlugin(RxDBMigrationSchemaPlugin);

async function initializeDb() {
  const database = await createRxDatabase<DatabaseCollections>({
    name: "my_app_db",  // IndexedDB database name
    storage: getRxStorageDexie(),
  });

  await database.addCollections({
    entities: { schema: entitySchema },
    entity_items: { schema: entityItemSchema },
    // ... more collections
  });

  return database;
}
```

## Schema Definition

RxDB schemas use JSON Schema format with RxDB-specific extensions:

```typescript
const entitySchema: RxJsonSchema<EntityDoc> = {
  version: 0,  // Increment when schema changes
  primaryKey: "id",
  type: "object",
  properties: {
    // Primary key — must have maxLength for indexed string fields
    id: { type: "string", maxLength: 36 },

    // Foreign key / user ownership
    userId: { type: "string" },

    // Required string field
    name: { type: "string" },

    // Enum-like string field
    status: { type: "string" },  // "active" | "archived"

    // Nullable string field — use array type syntax
    description: { type: ["string", "null"] },

    // Boolean field
    isPublic: { type: "boolean" },

    // Number field
    sortOrder: { type: "number" },

    // Nullable number field
    price: { type: ["number", "null"] },

    // Timestamps (stored as milliseconds, not Date objects)
    createdAt: { type: "number" },
    updatedAt: { type: "number" },

    // REQUIRED: RxDB replication deletion flag
    _deleted: { type: "boolean" },
  },
  required: [
    "id",
    "userId",
    "name",
    "status",
    "isPublic",
    "sortOrder",
    "createdAt",
    "updatedAt",
    "_deleted",  // Must be required for replication
  ],
  // Indexes for query performance
  // Note: indexed fields must be in 'required' array
  indexes: [
    "userId",
    ["userId", "status"],  // Compound index
  ],
};
```

### Schema Rules

1. **Primary key**: Always `id: { type: "string", maxLength: 36 }` for UUIDs
2. **Timestamps**: Store as `number` (milliseconds), not Date objects
3. **Nullable fields**: Use `type: ["string", "null"]` array syntax
4. **`_deleted` flag**: Required in both `properties` and `required` for replication
5. **Indexes**: Indexed fields must be in the `required` array
6. **JSON arrays/objects**: Store as stringified JSON string, e.g., `tags: { type: ["string", "null"] }`

## TypeScript Types

Define document types matching the schema:

```typescript
export interface EntityDoc {
  id: string;
  userId: string;
  name: string;
  status: string;
  description: string | null;
  isPublic: boolean;
  sortOrder: number;
  price: number | null;
  createdAt: number;
  updatedAt: number;
  _deleted: boolean;
}

// Database collection types
export type DatabaseCollections = {
  entities: RxCollection<EntityDoc>;
  entity_items: RxCollection<EntityItemDoc>;
};

export type MyAppDatabase = RxDatabase<DatabaseCollections>;
```

## Schema Migrations

When schema changes, increment version and provide a migration strategy:

```typescript
const entitySchema: RxJsonSchema<EntityDoc> = {
  version: 1,  // Bumped from 0
  // ... properties including new field
  properties: {
    // ... existing fields
    price: { type: ["number", "null"] },  // New field
  },
};

await database.addCollections({
  entities: {
    schema: entitySchema,
    migrationStrategies: {
      // Migration from version 0 to version 1
      1: (oldDoc) => ({
        ...oldDoc,
        price: oldDoc.price ?? null,  // Default for new field
      }),
    },
  },
});
```

## Database Singleton Pattern

Ensure only one database instance exists across the app:

```typescript
// apps/web/src/lib/db/db.ts

let dbSingleton: Awaited<ReturnType<typeof initializeDb>> | null = null;

export async function getOrCreateDb() {
  if (!dbSingleton) {
    dbSingleton = await initializeDb();
  }
  return dbSingleton;
}
```

## Full Example

```typescript
// apps/web/src/lib/db/db.ts
import { createRxDatabase, addRxPlugin } from "rxdb/plugins/core";
import { getRxStorageDexie } from "rxdb/plugins/storage-dexie";
import { RxDBMigrationSchemaPlugin } from "rxdb/plugins/migration-schema";
import { createCollection } from "@tanstack/react-db";
import { rxdbCollectionOptions } from "@tanstack/rxdb-db-collection";

import type { RxCollection, RxDatabase, RxJsonSchema } from "rxdb";

addRxPlugin(RxDBMigrationSchemaPlugin);

// --- Schema ---
const entitySchema: RxJsonSchema<EntityDoc> = {
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 36 },
    userId: { type: "string" },
    name: { type: "string" },
    createdAt: { type: "number" },
    updatedAt: { type: "number" },
    _deleted: { type: "boolean" },
  },
  required: ["id", "userId", "name", "createdAt", "updatedAt", "_deleted"],
  indexes: ["userId"],
};

// --- Types ---
export interface EntityDoc {
  id: string;
  userId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  _deleted: boolean;
}

export type DatabaseCollections = {
  entities: RxCollection<EntityDoc>;
};

export type MyAppDatabase = RxDatabase<DatabaseCollections>;

// --- Initialization ---
let dbSingleton: Awaited<ReturnType<typeof initializeDb>> | null = null;

async function initializeDb() {
  const database = await createRxDatabase<DatabaseCollections>({
    name: "my_app_db",
    storage: getRxStorageDexie(),
  });

  await database.addCollections({
    entities: { schema: entitySchema },
  });

  // Set up replication (see client-replication.md)
  // const replicationState = setupReplication(database, client);

  // Bridge to TanStack DB (see react-db-integration.md)
  const entityCollection = createCollection(
    rxdbCollectionOptions({ rxCollection: database.entities }),
  );

  return { rxdb: database, entityCollection };
}

export async function getOrCreateDb() {
  if (!dbSingleton) {
    dbSingleton = await initializeDb();
  }
  return dbSingleton;
}
```
