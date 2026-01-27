/**
 * Scryfall API fetch utilities
 *
 * Provides functions to fetch card data from the Scryfall API
 * and upsert it into the scryfall_card table.
 */

import { db } from "@mana-vault/db";
import { scryfallCard } from "@mana-vault/db/schema/app";
import { eq } from "drizzle-orm";

/** Scryfall card response structure (simplified for our needs) */
interface ScryfallCardResponse {
  id: string;
  oracle_id: string;
  name: string;
  set: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  color_identity?: string[];
  image_uris?: {
    normal?: string;
    small?: string;
    large?: string;
  };
  card_faces?: Array<{
    image_uris?: {
      normal?: string;
    };
  }>;
  scryfall_uri: string;
}

/**
 * Fetch a single card from Scryfall API by its ID.
 * Implements rate limiting consideration (Scryfall allows 10 req/sec).
 *
 * @param scryfallId - The Scryfall UUID
 * @returns The card data or null if not found
 */
async function fetchCardFromScryfall(scryfallId: string): Promise<ScryfallCardResponse | null> {
  try {
    const response = await fetch(`https://api.scryfall.com/cards/${scryfallId}`, {
      headers: {
        // Be a good API citizen
        "User-Agent": "ManaVault/1.0 (https://mana-vault.app)",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Scryfall API error: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as ScryfallCardResponse;
  } catch (error) {
    console.error(`Failed to fetch card ${scryfallId} from Scryfall:`, error);
    return null;
  }
}

/**
 * Get the primary image URI from a Scryfall card.
 * Handles both single-faced and double-faced cards.
 */
function getImageUri(card: ScryfallCardResponse): string | null {
  // Single-faced card
  if (card.image_uris?.normal) {
    return card.image_uris.normal;
  }

  // Double-faced card - use front face
  if (card.card_faces?.[0]?.image_uris?.normal) {
    return card.card_faces[0].image_uris.normal;
  }

  return null;
}

/**
 * Ensure a Scryfall card exists in the database.
 * If the card doesn't exist, fetch it from Scryfall API and insert it.
 *
 * @param scryfallId - The Scryfall UUID to ensure exists
 * @returns The card's oracle_id if found/created, null otherwise
 */
export async function ensureScryfallCard(
  scryfallId: string,
): Promise<{ id: string; oracleId: string } | null> {
  // First check if the card already exists in our database
  const [existingCard] = await db
    .select({ id: scryfallCard.id, oracleId: scryfallCard.oracleId })
    .from(scryfallCard)
    .where(eq(scryfallCard.id, scryfallId))
    .limit(1);

  if (existingCard) {
    return existingCard;
  }

  // Card doesn't exist - fetch from Scryfall API
  const cardData = await fetchCardFromScryfall(scryfallId);
  if (!cardData) {
    return null;
  }

  // Insert the card into our database
  try {
    await db.insert(scryfallCard).values({
      id: cardData.id,
      oracleId: cardData.oracle_id,
      name: cardData.name,
      setCode: cardData.set,
      setName: cardData.set_name,
      collectorNumber: cardData.collector_number,
      rarity: cardData.rarity,
      manaCost: cardData.mana_cost ?? null,
      cmc: cardData.cmc ?? null,
      typeLine: cardData.type_line ?? null,
      oracleText: cardData.oracle_text ?? null,
      colors: cardData.colors ? JSON.stringify(cardData.colors) : null,
      colorIdentity: cardData.color_identity ? JSON.stringify(cardData.color_identity) : null,
      imageUri: getImageUri(cardData),
      scryfallUri: cardData.scryfall_uri,
      dataJson: JSON.stringify(cardData),
    });

    return { id: cardData.id, oracleId: cardData.oracle_id };
  } catch (error) {
    // Handle race condition where another request inserted the card
    if (
      error instanceof Error &&
      (error.message.includes("UNIQUE constraint failed") ||
        error.message.includes("SQLITE_CONSTRAINT_PRIMARYKEY"))
    ) {
      // Card was inserted by another request, fetch it
      const [insertedCard] = await db
        .select({ id: scryfallCard.id, oracleId: scryfallCard.oracleId })
        .from(scryfallCard)
        .where(eq(scryfallCard.id, scryfallId))
        .limit(1);

      return insertedCard ?? null;
    }

    throw error;
  }
}

/**
 * Batch ensure multiple Scryfall cards exist.
 * Fetches missing cards from Scryfall API with rate limiting.
 *
 * @param scryfallIds - Array of Scryfall UUIDs to ensure exist
 * @returns Map of scryfallId to {id, oracleId} for found/created cards
 */
export async function ensureScryfallCards(
  scryfallIds: string[],
): Promise<Map<string, { id: string; oracleId: string }>> {
  const results = new Map<string, { id: string; oracleId: string }>();

  // Deduplicate IDs
  const uniqueIds = [...new Set(scryfallIds)];

  // Process cards with a small delay between API calls to respect rate limits
  for (const id of uniqueIds) {
    const card = await ensureScryfallCard(id);
    if (card) {
      results.set(id, card);
    }

    // Add a small delay between API calls (100ms = 10 req/sec max)
    // Only delay if we actually made an API call (card wasn't in DB)
    if (!results.has(id)) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return results;
}
