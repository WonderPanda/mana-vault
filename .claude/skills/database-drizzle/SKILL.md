---
name: database-drizzle
description: >
  Drizzle ORM schema patterns, D1 bulk inserts, and data model guidelines for Mana Vault.
  Use when modifying database schema, writing Drizzle queries, working with collection cards,
  virtual lists, or any server-side data operations. IMPORTANT: Always read SCHEMA.md before
  making data model changes.
---

# Database (Drizzle ORM)

- Schema files in `packages/db/src/schema/`
- Use SQLite with D1 (Cloudflare) dialect
- Column naming: snake_case in database, camelCase in TypeScript
- Always define relations separately from table definitions
- Use `integer` with `mode: "timestamp_ms"` for dates
- **IMPORTANT**: Before modifying schema or writing queries, review `SCHEMA.md` to understand the data model and relationships

## Cloudflare D1 Bulk Inserts

Cloudflare D1 has a limit of ~100 bound variables per query. For bulk inserts, use the `json_each` + `json_extract` pattern: serialize the entire array as a single JSON string (1 bound variable), then use `json_each()` to expand rows and `json_extract()` to pull columns.

```typescript
const CHUNK_SIZE = 100;
for (let i = 0; i < items.length; i += CHUNK_SIZE) {
  const chunk = items.slice(i, i + CHUNK_SIZE);
  const jsonData = JSON.stringify(chunk);

  await db.run(sql`
    INSERT OR IGNORE INTO ${myTable} (id, name, value)
    SELECT
      json_extract(value, '$.id'),
      json_extract(value, '$.name'),
      json_extract(value, '$.value')
    FROM json_each(${jsonData})
  `);
}
```

**Key points:**

- Process in chunks of ~100 to avoid memory issues
- `json_each(${jsonData})` expands the JSON array into rows with a `value` column
- `json_extract(value, '$.field')` pulls each field from the JSON object
- Use `INSERT OR IGNORE` or `INSERT OR REPLACE` as needed

**Existing implementations:**

- `apps/server/src/queue-handlers/scryfall-import.ts` — Scryfall card import
- `packages/api/src/routers/collections.ts` — collection card import

## Data Model Guidelines

When working with the core data model, keep these principles in mind:

1. **Collection is the source of truth**: `collection_card` represents cards the user physically owns. Each row = one physical card.

2. **Lists are separate from Collection**: `virtual_list` and `virtual_list_card` are staging areas and historical records. They reference cards but don't represent ownership.

3. **Never auto-create collection cards**: When importing to lists, only create `virtual_list_card` entries with `scryfall_card_id`. Collection cards are only created via explicit "move to collection" action.

4. **Never delete collection cards from list operations**: Deleting a list should only remove `virtual_list` and `virtual_list_card` entries. Collection cards are independent.

5. **Soft deletes for collection cards**: Use `status` field (owned/traded/sold/lost) instead of hard deletes to preserve history.

## Environment Variables

- Validated via Zod in `packages/env/`
- Server env: `@mana-vault/env/server`
- Web env: `@mana-vault/env/web`
- Native env: `@mana-vault/env/native`
- Server `.env` files go in `apps/server/.env`
