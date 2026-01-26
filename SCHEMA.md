# Database Schema Plan

This document outlines the planned database schema for Mana Vault. The database is SQLite using Drizzle ORM.

> **IMPORTANT FOR AI AGENTS**: This document defines the core data model and domain concepts for the application. Before making any changes to the database schema, API routes, or features that involve data models, **read this document thoroughly** to understand the relationships and intent behind the design.

## Key Domain Concepts

### Collection vs Lists

Understanding the distinction between **Collection** and **Lists** is critical:

| Concept                                          | Source of Truth                | Purpose                                                                                        |
| ------------------------------------------------ | ------------------------------ | ---------------------------------------------------------------------------------------------- |
| **Collection** (`collection_card`)               | YES - cards you physically own | Tracks every physical card in your possession with condition, location, deck assignment        |
| **Lists** (`virtual_list` + `virtual_list_card`) | NO - references/snapshots      | Staging areas, wishlists, historical records. References cards but doesn't represent ownership |

**Collection Cards** are the authoritative record of cards you own. Each row = one physical card. Cards in your collection can be:

- Assigned to storage locations (binders, boxes)
- Assigned to decks
- Tagged for organization
- Tracked through their entire lifecycle (acquired → traded/sold)

**Virtual Lists** are separate organizational tools that reference cards:

- **Owned Lists**: Stage cards before adding to collection (e.g., "Birthday Gift 2024")
- **Wishlists**: Track cards you want to acquire
- Lists reference Scryfall cards directly via `scryfall_card_id`
- Lists can optionally link to collection cards via `collection_card_id` after "move to collection"
- **Deleting a list never affects collection cards**

### Typical Workflows

**Receiving new cards (gift, purchase, trade)**:

1. Create an "owned" list with source info
2. Import cards via CSV → creates list entries referencing Scryfall cards
3. Review and verify the list
4. "Move to collection" → creates `collection_card` entries
5. List remains as historical record

**Building a wishlist**:

1. Create a "wishlist" list
2. Add cards you want (via search or import)
3. When you acquire a card, either remove from wishlist or link to new collection card

## Existing Tables (auth.ts)

- `user` - User accounts (Better-Auth)
- `session` - User sessions
- `account` - OAuth/credential accounts
- `verification` - Email verification tokens

---

## Proposed New Tables

### Card Reference Data

#### `scryfall_card`

Cached card data from Scryfall API. This is reference data, not user-owned cards.

| Column           | Type      | Description                                |
| ---------------- | --------- | ------------------------------------------ |
| id               | text (PK) | Scryfall UUID                              |
| oracle_id        | text      | Oracle ID (groups all printings)           |
| name             | text      | Card name                                  |
| set_code         | text      | Set code (e.g., "neo")                     |
| set_name         | text      | Full set name                              |
| collector_number | text      | Collector number within set                |
| rarity           | text      | common, uncommon, rare, mythic             |
| mana_cost        | text      | Mana cost string                           |
| cmc              | real      | Converted mana cost                        |
| type_line        | text      | Full type line                             |
| oracle_text      | text      | Rules text                                 |
| colors           | text      | JSON array of colors                       |
| color_identity   | text      | JSON array of color identity               |
| image_uri        | text      | Primary image URL                          |
| scryfall_uri     | text      | Link to Scryfall page                      |
| data_json        | text      | Full Scryfall JSON (for additional fields) |
| created_at       | integer   | When cached                                |
| updated_at       | integer   | Last cache refresh                         |

**Indexes**: `oracle_id`, `name`, `set_code`

---

### User Collection

#### `collection_card`

Individual cards owned by a user. **Each row = one physical card.** This allows each card to have its own condition, location, and deck assignment.

| Column           | Type               | Description                                  |
| ---------------- | ------------------ | -------------------------------------------- |
| id               | text (PK)          | UUID                                         |
| user_id          | text (FK)          | Owner                                        |
| scryfall_card_id | text (FK)          | Reference to scryfall_card                   |
| condition        | text               | NM, LP, MP, HP, DMG                          |
| is_foil          | integer            | Boolean - foil or non-foil                   |
| language         | text               | Card language (default "en")                 |
| notes            | text               | User notes                                   |
| acquired_at      | integer            | When acquired                                |
| acquired_from    | text               | Where it came from (optional)                |
| status           | text               | owned, traded, sold, lost (default "owned")  |
| removed_at       | integer (nullable) | When card left collection (traded/sold/lost) |
| created_at       | integer            | Record created                               |
| updated_at       | integer            | Record updated                               |

**Indexes**: `user_id`, `scryfall_card_id`, `user_id + scryfall_card_id`, `user_id + status`

**Design Decisions**:

1. **Each physical card is its own row** (no quantity field). This enables:
   - Different conditions for each copy (NM vs damaged)
   - Individual location tracking (one copy in deck, another in binder)
   - Precise deck assignment without ambiguity
   - Full history tracking per card

2. **Soft deletes via status field**: Cards are never hard-deleted. When traded/sold, the `status` changes and `removed_at` is set. This allows:
   - Search for any card you've ever owned
   - See "I had this card but traded it to X on Y date"
   - Filter views to show only currently owned cards (status = "owned")
   - Full historical record of your collection over time

---

### Physical Storage

#### `storage_container`

Binders, boxes, and other storage solutions.

| Column      | Type      | Description                                    |
| ----------- | --------- | ---------------------------------------------- |
| id          | text (PK) | UUID                                           |
| user_id     | text (FK) | Owner                                          |
| name        | text      | Container name (e.g., "Trade Binder", "Box 1") |
| type        | text      | binder, box, deck_box, other                   |
| description | text      | Optional notes                                 |
| sort_order  | integer   | User-defined ordering                          |
| created_at  | integer   |                                                |
| updated_at  | integer   |                                                |

**Indexes**: `user_id`

#### `collection_card_location`

Current location of a collection card.

| Column               | Type                | Description                              |
| -------------------- | ------------------- | ---------------------------------------- |
| id                   | text (PK)           | UUID                                     |
| collection_card_id   | text (FK, unique)   | The card (one current location per card) |
| storage_container_id | text (FK, nullable) | Current container (null = unassigned)    |
| deck_id              | text (FK, nullable) | If in a deck                             |
| assigned_at          | integer             | When placed here                         |

**Constraint**: Either `storage_container_id` OR `deck_id` should be set, not both (card is in storage OR in a deck).

**Indexes**: `collection_card_id` (unique), `storage_container_id`, `deck_id`

#### `collection_card_location_history`

Historical record of where a card has been. Enables "show me all decks this card has been in."

| Column               | Type                | Description                                |
| -------------------- | ------------------- | ------------------------------------------ |
| id                   | text (PK)           | UUID                                       |
| collection_card_id   | text (FK)           | The card                                   |
| storage_container_id | text (FK, nullable) | Container it was in                        |
| deck_id              | text (FK, nullable) | Deck it was in                             |
| virtual_list_id      | text (FK, nullable) | Original virtual list (if from a snapshot) |
| started_at           | integer             | When card was placed here                  |
| ended_at             | integer             | When card was moved away                   |

**Indexes**: `collection_card_id`, `deck_id`, `virtual_list_id`

**Use cases**:

- "What decks has this Sol Ring been in?"
- "This card originally came from my brother-in-law's collection"
- Timeline view of a card's journey through your collection

---

### Decks

#### `deck`

User's deck lists.

| Column         | Type      | Description                                                 |
| -------------- | --------- | ----------------------------------------------------------- |
| id             | text (PK) | UUID                                                        |
| user_id        | text (FK) | Owner                                                       |
| name           | text      | Deck name                                                   |
| format         | text      | commander, standard, modern, legacy, pioneer, pauper, other |
| status         | text      | active, retired, in_progress, theorycraft                   |
| archetype      | text      | aggro, control, combo, midrange, tempo, other               |
| color_identity | text      | JSON array of colors                                        |
| description    | text      | Deck notes/primer                                           |
| is_public      | integer   | Boolean - for future sharing                                |
| sort_order     | integer   | User-defined ordering                                       |
| created_at     | integer   |                                                             |
| updated_at     | integer   |                                                             |

**Indexes**: `user_id`, `user_id + status`, `user_id + format`

#### `deck_card`

Cards in a deck (the deck list itself). Uses hybrid ID approach: oracle_id for the card concept, optional preferred printing.

| Column                | Type                | Description                                          |
| --------------------- | ------------------- | ---------------------------------------------------- |
| id                    | text (PK)           | UUID                                                 |
| deck_id               | text (FK)           | The deck                                             |
| oracle_id             | text                | Oracle ID - the card you want (any printing)         |
| preferred_scryfall_id | text (FK, nullable) | Preferred printing (optional aesthetic choice)       |
| quantity              | integer             | How many in the deck                                 |
| board                 | text                | main, sideboard, maybeboard                          |
| is_commander          | integer             | Boolean - is this a commander (for Commander format) |
| is_companion          | integer             | Boolean - is this a companion                        |
| collection_card_id    | text (FK, nullable) | Link to owned copy (if any)                          |
| is_proxy              | integer             | Boolean - using a proxy for this slot                |
| sort_order            | integer             | Order in list                                        |
| created_at            | integer             |                                                      |
| updated_at            | integer             |                                                      |

**Indexes**: `deck_id`, `oracle_id`, `collection_card_id`, `deck_id + is_commander`

**Design decisions**:

- `oracle_id` allows flexible deck building without choosing a specific printing upfront
- `preferred_scryfall_id` captures aesthetic preferences (e.g., "I want the retro frame version")
- `collection_card_id` links to the actual physical card you own (which has its own scryfall_card_id)
- `is_commander` provides first-class Commander support (can have multiple for Partner commanders)
- A deck_card can exist without a collection_card_id (theorycraft/wishlist). When linked, it means "this physical card fills this deck slot."

#### `deck_tag`

Tags scoped to a specific deck for deck-building organization.

| Column     | Type      | Description                                   |
| ---------- | --------- | --------------------------------------------- |
| id         | text (PK) | UUID                                          |
| deck_id    | text (FK) | The deck this tag belongs to                  |
| name       | text      | Tag name (e.g., "ramp", "removal", "win-con") |
| color      | text      | Display color (hex)                           |
| created_at | integer   |                                               |

**Indexes**: `deck_id`

**Unique constraint**: `deck_id + name`

#### `deck_card_tag`

Many-to-many: deck-scoped tags on deck cards.

| Column       | Type      | Description |
| ------------ | --------- | ----------- |
| deck_card_id | text (FK) |             |
| deck_tag_id  | text (FK) |             |
| created_at   | integer   |             |

**Primary key**: `deck_card_id + deck_tag_id`

**Use cases**:

- Tag cards by function: "ramp", "removal", "card draw", "win condition"
- Group by custom categories: "synergy piece", "pet card", "budget replacement"
- Filter deck view by tags to analyze card distribution

---

### Wishlists

Wishlists are implemented using **virtual lists with `list_type = 'wishlist'`**. See the Virtual Lists section above.

The legacy `wishlist_item` table exists for deck-specific wishlists but the primary wishlist functionality uses virtual lists.

#### `wishlist_item` (Legacy/Deck-Specific)

Deck-specific wishlists for tracking cards needed for a particular deck.

| Column           | Type                | Description                      |
| ---------------- | ------------------- | -------------------------------- |
| id               | text (PK)           | UUID                             |
| user_id          | text (FK)           | Owner                            |
| scryfall_card_id | text (FK)           | Desired card                     |
| deck_id          | text (FK, nullable) | If deck-specific (null = global) |
| quantity         | integer             | How many wanted                  |
| priority         | integer             | Sort order within the wishlist   |
| notes            | text                | Why you want it, etc.            |
| created_at       | integer             |                                  |
| updated_at       | integer             |                                  |

**Indexes**: `user_id`, `deck_id`, `user_id + deck_id`

**Unique constraint**: `user_id + scryfall_card_id + deck_id` (can't have same card twice in same wishlist)

**Note**: For general wishlists (not tied to a specific deck), use virtual lists with `list_type = 'wishlist'` instead.

---

### Virtual Lists (Staging & Snapshots)

Virtual lists are **separate from the collection**. They serve as staging areas or historical records for groups of cards. Lists reference Scryfall cards directly and can optionally be linked to collection cards later.

**Key Concept**: Lists are NOT the source of truth for owned cards. The `collection_card` table is the source of truth. Lists are snapshots/references that can be used to:

- Stage cards before adding them to your collection
- Track cards you want to acquire (wishlists)
- Record the history of a gift, purchase, or trade
- Organize cards for any purpose without affecting your collection

#### `virtual_list`

Named lists for staging or historical preservation.

| Column        | Type      | Description                                   |
| ------------- | --------- | --------------------------------------------- |
| id            | text (PK) | UUID                                          |
| user_id       | text (FK) | Owner                                         |
| name          | text      | List name (e.g., "Cards from brother-in-law") |
| description   | text      | Notes about the list                          |
| list_type     | text      | **owned** or **wishlist** (default: owned)    |
| source_type   | text      | gift, purchase, trade, other                  |
| source_name   | text      | Who/where it came from                        |
| snapshot_date | integer   | When the collection was received/captured     |
| created_at    | integer   |                                               |
| updated_at    | integer   |                                               |

**Indexes**: `user_id`

**List Types**:

- **owned**: Cards you have received or purchased. These can later be "moved to collection" to create actual `collection_card` entries.
- **wishlist**: Cards you want to acquire. No collection cards involved until you obtain them.

#### `virtual_list_card`

Cards on a virtual list. References Scryfall cards directly, with optional link to collection cards.

| Column             | Type                | Description                                 |
| ------------------ | ------------------- | ------------------------------------------- |
| id                 | text (PK)           | UUID                                        |
| virtual_list_id    | text (FK)           | The list                                    |
| scryfall_card_id   | text (FK, nullable) | Direct reference to the card                |
| collection_card_id | text (FK, nullable) | Link to collection (if moved to collection) |
| quantity           | integer             | Number of copies (default 1)                |
| condition          | text                | Desired/actual condition                    |
| is_foil            | integer             | Desired/actual foil status                  |
| language           | text                | Desired/actual language                     |
| snapshot_price     | real                | Value at time of snapshot                   |
| price_source_id    | text (FK, nullable) | Which price source was used                 |
| notes              | text                |                                             |
| created_at         | integer             |                                             |

**Indexes**: `virtual_list_id`, `collection_card_id`, `scryfall_card_id`

**Important**: When importing cards to a list (via CSV or search), cards are always created as Scryfall references (`scryfall_card_id`). The `collection_card_id` is only populated later when the user explicitly "moves cards to collection."

**Workflow**:

1. User creates a list (e.g., "Birthday Gift 2024", type: owned)
2. User imports CSV → creates `virtual_list_card` entries with `scryfall_card_id`
3. User reviews the list, makes corrections
4. User "moves to collection" → creates `collection_card` entries and links them via `collection_card_id`
5. The list remains as a historical record of what was received

**Deleting a list**: Only deletes the `virtual_list` and `virtual_list_card` entries. Collection cards are **never** affected by list deletion.

---

### Tags

#### `tag`

User-defined tags.

| Column     | Type      | Description                    |
| ---------- | --------- | ------------------------------ |
| id         | text (PK) | UUID                           |
| user_id    | text (FK) | Owner                          |
| name       | text      | Tag name                       |
| color      | text      | Display color (hex)            |
| is_system  | integer   | Boolean - system tag vs custom |
| created_at | integer   |                                |

**Indexes**: `user_id`

**Unique constraint**: `user_id + name`

#### `collection_card_tag`

Many-to-many: tags on collection cards.

| Column             | Type      | Description |
| ------------------ | --------- | ----------- |
| collection_card_id | text (FK) |             |
| tag_id             | text (FK) |             |
| created_at         | integer   |             |

**Primary key**: `collection_card_id + tag_id`

---

### Trade Tracking

#### `trade_partner`

People you trade with.

| Column       | Type      | Description       |
| ------------ | --------- | ----------------- |
| id           | text (PK) | UUID              |
| user_id      | text (FK) | Owner             |
| name         | text      | Partner's name    |
| contact_info | text      | How to reach them |
| notes        | text      |                   |
| created_at   | integer   |                   |
| updated_at   | integer   |                   |

**Indexes**: `user_id`

#### `trade`

A trade event.

| Column           | Type                | Description             |
| ---------------- | ------------------- | ----------------------- |
| id               | text (PK)           | UUID                    |
| user_id          | text (FK)           | Owner                   |
| trade_partner_id | text (FK, nullable) | Who you traded with     |
| trade_date       | integer             | When the trade happened |
| notes            | text                |                         |
| created_at       | integer             |                         |
| updated_at       | integer             |                         |

**Indexes**: `user_id`, `trade_partner_id`

#### `trade_card`

Cards involved in a trade.

| Column             | Type                | Description                              |
| ------------------ | ------------------- | ---------------------------------------- |
| id                 | text (PK)           | UUID                                     |
| trade_id           | text (FK)           | The trade                                |
| scryfall_card_id   | text (FK)           | Which card                               |
| collection_card_id | text (FK, nullable) | Link to your collection (if you gave it) |
| direction          | text                | gave, received                           |
| quantity           | integer             | How many                                 |
| value_at_trade     | real                | Agreed/market value at trade time        |
| condition          | text                | Card condition                           |
| is_foil            | integer             | Boolean                                  |
| notes              | text                |                                          |

**Indexes**: `trade_id`, `collection_card_id`

---

### Pricing

#### `price_source`

Pricing providers.

| Column              | Type      | Description                            |
| ------------------- | --------- | -------------------------------------- |
| id                  | text (PK) | UUID                                   |
| name                | text      | scryfall, tcgplayer, cardkingdom, etc. |
| display_name        | text      | Human-readable name                    |
| is_active           | integer   | Boolean - is this source enabled       |
| last_sync_at        | integer   | Last successful sync                   |
| sync_interval_hours | integer   | How often to sync                      |
| created_at          | integer   |                                        |
| updated_at          | integer   |                                        |

#### `card_price`

Price data for cards from various sources.

| Column           | Type      | Description                       |
| ---------------- | --------- | --------------------------------- |
| id               | text (PK) | UUID                              |
| scryfall_card_id | text (FK) | The card                          |
| price_source_id  | text (FK) | The source                        |
| price_usd        | real      | Normal price in USD               |
| price_usd_foil   | real      | Foil price in USD                 |
| price_usd_etched | real      | Etched foil price (if applicable) |
| fetched_at       | integer   | When this price was fetched       |

**Indexes**: `scryfall_card_id`, `price_source_id`, `scryfall_card_id + price_source_id`

**Unique constraint**: `scryfall_card_id + price_source_id` (one price per card per source)

---

## Resolved Design Decisions

1. **Individual rows for collection_card**: Each physical card is its own row (no quantity field). This enables different conditions per copy, individual location tracking, and precise history.

2. **Location history tracking**: Yes, via `collection_card_location_history` table. Enables "what decks has this card been in?" and "where did this card originally come from?"

3. **Hybrid Oracle ID approach for deck_card**: Uses `oracle_id` for the card concept (flexible deck building) plus optional `preferred_scryfall_id` for aesthetic preferences. The `collection_card_id` link connects to the actual owned card.

4. **First-class Commander support**: `is_commander` and `is_companion` flags on `deck_card` for Commander format.

5. **Deck-scoped tags**: Separate `deck_tag` and `deck_card_tag` tables allow tagging cards within a deck context (ramp, removal, etc.) independent of collection-level tags.

6. **Current prices only**: No `card_price_history` table. Historical pricing will be fetched from external APIs if needed. The `card_price` table stores current prices per source.

7. **Soft deletes via status field**: Collection cards are never hard-deleted. The `status` field tracks lifecycle (owned, traded, sold, lost) and `removed_at` records when the card left your collection. This enables searching for any card you've ever owned and seeing its full history ("I had this but traded it to X on Y date").

8. **Soft deletes for sync (`deleted_at` column)**: For RxDB replication to properly handle deletions, the following tables include a `deleted_at` timestamp column:
   - `collection_card` - marks card as deleted for sync purposes
   - `collection_card_location` - marks location assignment as deleted
   - `storage_container` - marks container as deleted

   When `deleted_at` is set, the sync pull handlers return the record with `_deleted: true`, allowing IndexedDB clients to remove the record. This is separate from the `status` field semantic - a card can be "traded" (status) but still exist for historical viewing, while `deleted_at` means "remove from client entirely."

9. **Lists are separate from Collection**: Virtual lists (`virtual_list` + `virtual_list_card`) are staging areas and historical records, NOT the source of truth for owned cards. Key principles:
   - Lists reference Scryfall cards directly via `scryfall_card_id`
   - Collection cards are only created when user explicitly "moves to collection"
   - Deleting a list **never** deletes collection cards
   - Lists can be "owned" (staging for cards you received) or "wishlist" (cards you want)
   - This separation allows importing/organizing cards without immediately affecting the collection

---

## Entity Relationship Summary

```
user
  ├── collection_card (many)
  │     ├── scryfall_card
  │     ├── collection_card_location
  │     │     ├── storage_container
  │     │     └── deck
  │     ├── collection_card_tag
  │     │     └── tag
  │     └── virtual_list_card
  │           └── virtual_list
  ├── deck (many)
  │     ├── deck_card (many)
  │     │     ├── scryfall_card
  │     │     └── collection_card (optional link)
  │     └── wishlist_item (deck-specific)
  ├── wishlist_item (global, many)
  ├── storage_container (many)
  ├── virtual_list (many)
  ├── tag (many)
  ├── trade_partner (many)
  └── trade (many)
        └── trade_card (many)

scryfall_card (reference data)
  └── card_price (many, per source)

price_source (system-level)

deck
  ├── deck_card (many)
  │     ├── oracle_id (card concept)
  │     ├── preferred_scryfall_id (optional printing preference)
  │     ├── collection_card (optional owned copy)
  │     └── deck_card_tag
  │           └── deck_tag (deck-scoped)
  └── deck_tag (many, scoped to this deck)

collection_card_location_history
  └── tracks: storage_container, deck, virtual_list over time
```
