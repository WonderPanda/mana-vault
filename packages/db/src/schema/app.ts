import { randomUUID } from "crypto";

import { relations, sql } from "drizzle-orm";
import { sqliteTable, text, integer, real, index, unique } from "drizzle-orm/sqlite-core";

import { user } from "./auth";

// =============================================================================
// Scryfall Import Tracking
// =============================================================================

/**
 * Tracks which chunks (R2 batch files) have been successfully processed.
 * Used to make the Scryfall import idempotent - if a chunk is already marked
 * as completed, we skip re-processing it.
 */
export const scryfallImportChunk = sqliteTable(
  "scryfall_import_chunk",
  {
    /** The R2 key for this chunk (e.g., "batches/default_cards/batch-00001.json") */
    r2Key: text("r2_key").primaryKey(),
    /** Number of cards that were inserted from this chunk */
    cardsInserted: integer("cards_inserted").notNull(),
    /** When processing of this chunk started */
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    /** When processing of this chunk completed */
    completedAt: integer("completed_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("scryfall_import_chunk_completed_at_idx").on(table.completedAt)],
);

// =============================================================================
// Card Reference Data
// =============================================================================

export const scryfallCard = sqliteTable(
  "scryfall_card",
  {
    id: text("id").primaryKey(), // Scryfall UUID
    oracleId: text("oracle_id").notNull(),
    name: text("name").notNull(),
    setCode: text("set_code").notNull(),
    setName: text("set_name").notNull(),
    collectorNumber: text("collector_number").notNull(),
    rarity: text("rarity").notNull(), // common, uncommon, rare, mythic
    manaCost: text("mana_cost"),
    cmc: real("cmc"),
    typeLine: text("type_line"),
    oracleText: text("oracle_text"),
    colors: text("colors"), // JSON array
    colorIdentity: text("color_identity"), // JSON array
    imageUri: text("image_uri"),
    scryfallUri: text("scryfall_uri"),
    priceUsd: real("price_usd"),
    priceUsdFoil: real("price_usd_foil"),
    priceUsdEtched: real("price_usd_etched"),
    dataJson: text("data_json"), // Full Scryfall JSON for additional fields
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("scryfall_card_oracle_id_idx").on(table.oracleId),
    index("scryfall_card_name_idx").on(table.name),
    index("scryfall_card_set_code_idx").on(table.setCode),
  ],
);

// =============================================================================
// Pricing
// =============================================================================

export const priceSource = sqliteTable("price_source", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  name: text("name").notNull().unique(), // scryfall, tcgplayer, cardkingdom
  displayName: text("display_name").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
  lastSyncAt: integer("last_sync_at", { mode: "timestamp_ms" }),
  syncIntervalHours: integer("sync_interval_hours").default(24),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .$onUpdate(() => new Date())
    .notNull(),
});

export const cardPrice = sqliteTable(
  "card_price",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    scryfallCardId: text("scryfall_card_id")
      .notNull()
      .references(() => scryfallCard.id, { onDelete: "cascade" }),
    priceSourceId: text("price_source_id")
      .notNull()
      .references(() => priceSource.id, { onDelete: "cascade" }),
    priceUsd: real("price_usd"),
    priceUsdFoil: real("price_usd_foil"),
    priceUsdEtched: real("price_usd_etched"),
    fetchedAt: integer("fetched_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("card_price_scryfall_card_id_idx").on(table.scryfallCardId),
    index("card_price_price_source_id_idx").on(table.priceSourceId),
    unique("card_price_card_source_unique").on(table.scryfallCardId, table.priceSourceId),
  ],
);

// =============================================================================
// User Collection
// =============================================================================

export const collectionCard = sqliteTable(
  "collection_card",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    scryfallCardId: text("scryfall_card_id")
      .notNull()
      .references(() => scryfallCard.id),
    condition: text("condition").default("NM").notNull(), // NM, LP, MP, HP, DMG
    isFoil: integer("is_foil", { mode: "boolean" }).default(false).notNull(),
    language: text("language").default("en").notNull(),
    notes: text("notes"),
    acquiredAt: integer("acquired_at", { mode: "timestamp_ms" }),
    acquiredFrom: text("acquired_from"),
    status: text("status").default("owned").notNull(), // owned, traded, sold, lost
    removedAt: integer("removed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
    /** Soft delete timestamp - when set, the card is considered deleted for sync purposes */
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("collection_card_user_id_idx").on(table.userId),
    index("collection_card_scryfall_card_id_idx").on(table.scryfallCardId),
    index("collection_card_user_scryfall_idx").on(table.userId, table.scryfallCardId),
    index("collection_card_user_status_idx").on(table.userId, table.status),
  ],
);

// =============================================================================
// Physical Storage
// =============================================================================

export const storageContainer = sqliteTable(
  "storage_container",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type").default("box").notNull(), // binder, box, deck_box, other
    description: text("description"),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
    /** Soft delete timestamp - when set, the container is considered deleted */
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("storage_container_user_id_idx").on(table.userId)],
);

export const collectionCardLocation = sqliteTable(
  "collection_card_location",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    collectionCardId: text("collection_card_id")
      .notNull()
      .unique()
      .references(() => collectionCard.id, { onDelete: "cascade" }),
    storageContainerId: text("storage_container_id").references(() => storageContainer.id, {
      onDelete: "set null",
    }),
    deckId: text("deck_id").references(() => deck.id, { onDelete: "set null" }),
    assignedAt: integer("assigned_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    /** Updated timestamp for sync - tracks when location was last modified. Falls back to assignedAt if null. */
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).$onUpdate(() => new Date()),
    /** Soft delete timestamp - when set, the location is considered deleted */
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("collection_card_location_card_idx").on(table.collectionCardId),
    index("collection_card_location_storage_idx").on(table.storageContainerId),
    index("collection_card_location_deck_idx").on(table.deckId),
  ],
);

export const collectionCardLocationHistory = sqliteTable(
  "collection_card_location_history",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    collectionCardId: text("collection_card_id")
      .notNull()
      .references(() => collectionCard.id, { onDelete: "cascade" }),
    storageContainerId: text("storage_container_id").references(() => storageContainer.id, {
      onDelete: "set null",
    }),
    deckId: text("deck_id").references(() => deck.id, { onDelete: "set null" }),
    virtualListId: text("virtual_list_id").references(() => virtualList.id, {
      onDelete: "set null",
    }),
    startedAt: integer("started_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    endedAt: integer("ended_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("collection_card_location_history_card_idx").on(table.collectionCardId),
    index("collection_card_location_history_deck_idx").on(table.deckId),
    index("collection_card_location_history_list_idx").on(table.virtualListId),
  ],
);

// =============================================================================
// Decks
// =============================================================================

export const deck = sqliteTable(
  "deck",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    format: text("format").default("commander").notNull(), // commander, standard, modern, legacy, pioneer, pauper, other
    status: text("status").default("in_progress").notNull(), // active, retired, in_progress, theorycraft
    archetype: text("archetype"), // aggro, control, combo, midrange, tempo, other
    colorIdentity: text("color_identity"), // JSON array
    description: text("description"),
    isPublic: integer("is_public", { mode: "boolean" }).default(false).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("deck_user_id_idx").on(table.userId),
    index("deck_user_status_idx").on(table.userId, table.status),
    index("deck_user_format_idx").on(table.userId, table.format),
  ],
);

export const deckCard = sqliteTable(
  "deck_card",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    deckId: text("deck_id")
      .notNull()
      .references(() => deck.id, { onDelete: "cascade" }),
    oracleId: text("oracle_id").notNull(), // Card concept (any printing)
    preferredScryfallId: text("preferred_scryfall_id").references(() => scryfallCard.id), // Preferred printing (optional)
    quantity: integer("quantity").default(1).notNull(),
    board: text("board").default("main").notNull(), // main, sideboard, maybeboard
    isCommander: integer("is_commander", { mode: "boolean" }).default(false).notNull(),
    isCompanion: integer("is_companion", { mode: "boolean" }).default(false).notNull(),
    collectionCardId: text("collection_card_id").references(() => collectionCard.id, {
      onDelete: "set null",
    }), // Link to owned copy
    isProxy: integer("is_proxy", { mode: "boolean" }).default(false).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("deck_card_deck_id_idx").on(table.deckId),
    index("deck_card_oracle_id_idx").on(table.oracleId),
    index("deck_card_collection_card_id_idx").on(table.collectionCardId),
    index("deck_card_deck_commander_idx").on(table.deckId, table.isCommander),
  ],
);

export const deckTag = sqliteTable(
  "deck_tag",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    deckId: text("deck_id")
      .notNull()
      .references(() => deck.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("deck_tag_deck_id_idx").on(table.deckId),
    unique("deck_tag_deck_name_unique").on(table.deckId, table.name),
  ],
);

export const deckCardTag = sqliteTable(
  "deck_card_tag",
  {
    deckCardId: text("deck_card_id")
      .notNull()
      .references(() => deckCard.id, { onDelete: "cascade" }),
    deckTagId: text("deck_tag_id")
      .notNull()
      .references(() => deckTag.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [unique("deck_card_tag_pk").on(table.deckCardId, table.deckTagId)],
);

// =============================================================================
// Wishlists
// =============================================================================

export const wishlistItem = sqliteTable(
  "wishlist_item",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    scryfallCardId: text("scryfall_card_id")
      .notNull()
      .references(() => scryfallCard.id),
    deckId: text("deck_id").references(() => deck.id, { onDelete: "cascade" }), // null = global wishlist
    quantity: integer("quantity").default(1).notNull(),
    priority: integer("priority").default(0).notNull(),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("wishlist_item_user_id_idx").on(table.userId),
    index("wishlist_item_deck_id_idx").on(table.deckId),
    index("wishlist_item_user_deck_idx").on(table.userId, table.deckId),
    unique("wishlist_item_user_card_deck_unique").on(
      table.userId,
      table.scryfallCardId,
      table.deckId,
    ),
  ],
);

// =============================================================================
// Virtual Lists (Snapshots)
// =============================================================================

export const virtualList = sqliteTable(
  "virtual_list",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    listType: text("list_type").default("owned").notNull(), // owned, wishlist
    sourceType: text("source_type"), // gift, purchase, trade, other
    sourceName: text("source_name"), // Who/where it came from
    snapshotDate: integer("snapshot_date", { mode: "timestamp_ms" }),
    isPublic: integer("is_public", { mode: "boolean" }).default(false).notNull(),
    slug: text("slug"), // URL-friendly slug for public lists (e.g., "my-awesome-deck"), unique per user
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("virtual_list_user_id_idx").on(table.userId),
    unique("virtual_list_user_slug_unique").on(table.userId, table.slug),
  ],
);

export const virtualListCard = sqliteTable(
  "virtual_list_card",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    virtualListId: text("virtual_list_id")
      .notNull()
      .references(() => virtualList.id, { onDelete: "cascade" }),
    // For owned lists: links to the actual collection card
    collectionCardId: text("collection_card_id").references(() => collectionCard.id, {
      onDelete: "cascade",
    }),
    // For wishlist items or unlinked cards: reference the scryfall card directly
    scryfallCardId: text("scryfall_card_id").references(() => scryfallCard.id),
    // Wishlist-specific fields (used when collectionCardId is null)
    quantity: integer("quantity").default(1).notNull(),
    condition: text("condition"), // Desired condition for wishlist
    isFoil: integer("is_foil", { mode: "boolean" }), // Desired foil status for wishlist
    language: text("language"), // Desired language for wishlist
    snapshotPrice: real("snapshot_price"),
    priceSourceId: text("price_source_id").references(() => priceSource.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("virtual_list_card_list_idx").on(table.virtualListId),
    index("virtual_list_card_collection_card_idx").on(table.collectionCardId),
    index("virtual_list_card_scryfall_idx").on(table.scryfallCardId),
  ],
);

// =============================================================================
// Tags (Collection-level)
// =============================================================================

export const tag = sqliteTable(
  "tag",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    isSystem: integer("is_system", { mode: "boolean" }).default(false).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [
    index("tag_user_id_idx").on(table.userId),
    unique("tag_user_name_unique").on(table.userId, table.name),
  ],
);

export const collectionCardTag = sqliteTable(
  "collection_card_tag",
  {
    collectionCardId: text("collection_card_id")
      .notNull()
      .references(() => collectionCard.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
  },
  (table) => [unique("collection_card_tag_pk").on(table.collectionCardId, table.tagId)],
);

// =============================================================================
// Trade Tracking
// =============================================================================

export const tradePartner = sqliteTable(
  "trade_partner",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    contactInfo: text("contact_info"),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("trade_partner_user_id_idx").on(table.userId)],
);

export const trade = sqliteTable(
  "trade",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tradePartnerId: text("trade_partner_id").references(() => tradePartner.id, {
      onDelete: "set null",
    }),
    tradeDate: integer("trade_date", { mode: "timestamp_ms" }),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("trade_user_id_idx").on(table.userId),
    index("trade_partner_idx").on(table.tradePartnerId),
  ],
);

export const tradeCard = sqliteTable(
  "trade_card",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    tradeId: text("trade_id")
      .notNull()
      .references(() => trade.id, { onDelete: "cascade" }),
    scryfallCardId: text("scryfall_card_id")
      .notNull()
      .references(() => scryfallCard.id),
    collectionCardId: text("collection_card_id").references(() => collectionCard.id, {
      onDelete: "set null",
    }),
    direction: text("direction").notNull(), // gave, received
    quantity: integer("quantity").default(1).notNull(),
    valueAtTrade: real("value_at_trade"),
    condition: text("condition"),
    isFoil: integer("is_foil", { mode: "boolean" }).default(false).notNull(),
    notes: text("notes"),
  },
  (table) => [
    index("trade_card_trade_id_idx").on(table.tradeId),
    index("trade_card_collection_card_id_idx").on(table.collectionCardId),
  ],
);

// =============================================================================
// Relations
// =============================================================================

// Scryfall Card Relations
export const scryfallCardRelations = relations(scryfallCard, ({ many }) => ({
  prices: many(cardPrice),
  collectionCards: many(collectionCard),
  wishlistItems: many(wishlistItem),
  tradeCards: many(tradeCard),
}));

// Price Relations
export const priceSourceRelations = relations(priceSource, ({ many }) => ({
  cardPrices: many(cardPrice),
}));

export const cardPriceRelations = relations(cardPrice, ({ one }) => ({
  scryfallCard: one(scryfallCard, {
    fields: [cardPrice.scryfallCardId],
    references: [scryfallCard.id],
  }),
  priceSource: one(priceSource, {
    fields: [cardPrice.priceSourceId],
    references: [priceSource.id],
  }),
}));

// Collection Card Relations
export const collectionCardRelations = relations(collectionCard, ({ one, many }) => ({
  user: one(user, {
    fields: [collectionCard.userId],
    references: [user.id],
  }),
  scryfallCard: one(scryfallCard, {
    fields: [collectionCard.scryfallCardId],
    references: [scryfallCard.id],
  }),
  location: one(collectionCardLocation),
  locationHistory: many(collectionCardLocationHistory),
  tags: many(collectionCardTag),
  virtualListCards: many(virtualListCard),
  deckCards: many(deckCard),
  tradeCards: many(tradeCard),
}));

// Storage Relations
export const storageContainerRelations = relations(storageContainer, ({ one, many }) => ({
  user: one(user, {
    fields: [storageContainer.userId],
    references: [user.id],
  }),
  cardLocations: many(collectionCardLocation),
}));

export const collectionCardLocationRelations = relations(collectionCardLocation, ({ one }) => ({
  collectionCard: one(collectionCard, {
    fields: [collectionCardLocation.collectionCardId],
    references: [collectionCard.id],
  }),
  storageContainer: one(storageContainer, {
    fields: [collectionCardLocation.storageContainerId],
    references: [storageContainer.id],
  }),
  deck: one(deck, {
    fields: [collectionCardLocation.deckId],
    references: [deck.id],
  }),
}));

export const collectionCardLocationHistoryRelations = relations(
  collectionCardLocationHistory,
  ({ one }) => ({
    collectionCard: one(collectionCard, {
      fields: [collectionCardLocationHistory.collectionCardId],
      references: [collectionCard.id],
    }),
    storageContainer: one(storageContainer, {
      fields: [collectionCardLocationHistory.storageContainerId],
      references: [storageContainer.id],
    }),
    deck: one(deck, {
      fields: [collectionCardLocationHistory.deckId],
      references: [deck.id],
    }),
    virtualList: one(virtualList, {
      fields: [collectionCardLocationHistory.virtualListId],
      references: [virtualList.id],
    }),
  }),
);

// Deck Relations
export const deckRelations = relations(deck, ({ one, many }) => ({
  user: one(user, {
    fields: [deck.userId],
    references: [user.id],
  }),
  cards: many(deckCard),
  tags: many(deckTag),
  wishlistItems: many(wishlistItem),
  cardLocations: many(collectionCardLocation),
}));

export const deckCardRelations = relations(deckCard, ({ one, many }) => ({
  deck: one(deck, {
    fields: [deckCard.deckId],
    references: [deck.id],
  }),
  preferredPrinting: one(scryfallCard, {
    fields: [deckCard.preferredScryfallId],
    references: [scryfallCard.id],
  }),
  collectionCard: one(collectionCard, {
    fields: [deckCard.collectionCardId],
    references: [collectionCard.id],
  }),
  tags: many(deckCardTag),
}));

export const deckTagRelations = relations(deckTag, ({ one, many }) => ({
  deck: one(deck, {
    fields: [deckTag.deckId],
    references: [deck.id],
  }),
  deckCardTags: many(deckCardTag),
}));

export const deckCardTagRelations = relations(deckCardTag, ({ one }) => ({
  deckCard: one(deckCard, {
    fields: [deckCardTag.deckCardId],
    references: [deckCard.id],
  }),
  deckTag: one(deckTag, {
    fields: [deckCardTag.deckTagId],
    references: [deckTag.id],
  }),
}));

// Wishlist Relations
export const wishlistItemRelations = relations(wishlistItem, ({ one }) => ({
  user: one(user, {
    fields: [wishlistItem.userId],
    references: [user.id],
  }),
  scryfallCard: one(scryfallCard, {
    fields: [wishlistItem.scryfallCardId],
    references: [scryfallCard.id],
  }),
  deck: one(deck, {
    fields: [wishlistItem.deckId],
    references: [deck.id],
  }),
}));

// Virtual List Relations
export const virtualListRelations = relations(virtualList, ({ one, many }) => ({
  user: one(user, {
    fields: [virtualList.userId],
    references: [user.id],
  }),
  cards: many(virtualListCard),
}));

export const virtualListCardRelations = relations(virtualListCard, ({ one }) => ({
  virtualList: one(virtualList, {
    fields: [virtualListCard.virtualListId],
    references: [virtualList.id],
  }),
  collectionCard: one(collectionCard, {
    fields: [virtualListCard.collectionCardId],
    references: [collectionCard.id],
  }),
  priceSource: one(priceSource, {
    fields: [virtualListCard.priceSourceId],
    references: [priceSource.id],
  }),
}));

// Tag Relations (Collection-level)
export const tagRelations = relations(tag, ({ one, many }) => ({
  user: one(user, {
    fields: [tag.userId],
    references: [user.id],
  }),
  collectionCardTags: many(collectionCardTag),
}));

export const collectionCardTagRelations = relations(collectionCardTag, ({ one }) => ({
  collectionCard: one(collectionCard, {
    fields: [collectionCardTag.collectionCardId],
    references: [collectionCard.id],
  }),
  tag: one(tag, {
    fields: [collectionCardTag.tagId],
    references: [tag.id],
  }),
}));

// Trade Relations
export const tradePartnerRelations = relations(tradePartner, ({ one, many }) => ({
  user: one(user, {
    fields: [tradePartner.userId],
    references: [user.id],
  }),
  trades: many(trade),
}));

export const tradeRelations = relations(trade, ({ one, many }) => ({
  user: one(user, {
    fields: [trade.userId],
    references: [user.id],
  }),
  tradePartner: one(tradePartner, {
    fields: [trade.tradePartnerId],
    references: [tradePartner.id],
  }),
  cards: many(tradeCard),
}));

export const tradeCardRelations = relations(tradeCard, ({ one }) => ({
  trade: one(trade, {
    fields: [tradeCard.tradeId],
    references: [trade.id],
  }),
  scryfallCard: one(scryfallCard, {
    fields: [tradeCard.scryfallCardId],
    references: [scryfallCard.id],
  }),
  collectionCard: one(collectionCard, {
    fields: [tradeCard.collectionCardId],
    references: [collectionCard.id],
  }),
}));
