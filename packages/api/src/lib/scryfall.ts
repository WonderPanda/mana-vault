/**
 * Scryfall API client utilities
 */

const SCRYFALL_API_BASE = "https://api.scryfall.com";

/**
 * Scryfall card response type (partial - only fields we care about)
 */
export interface ScryfallCardResponse {
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
    small?: string;
    normal?: string;
    large?: string;
    png?: string;
    art_crop?: string;
    border_crop?: string;
  };
  card_faces?: Array<{
    image_uris?: {
      small?: string;
      normal?: string;
      large?: string;
    };
  }>;
  scryfall_uri?: string;
}

/**
 * Fetch a single card from Scryfall by ID
 */
export async function fetchScryfallCard(scryfallId: string): Promise<ScryfallCardResponse | null> {
  try {
    const response = await fetch(`${SCRYFALL_API_BASE}/cards/${scryfallId}`);

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Scryfall API error: ${response.status}`);
    }

    return (await response.json()) as ScryfallCardResponse;
  } catch (error) {
    console.error(`Failed to fetch card ${scryfallId}:`, error);
    return null;
  }
}

/**
 * Fetch multiple cards from Scryfall in parallel with rate limiting
 * Scryfall asks for 50-100ms delay between requests
 */
export async function fetchScryfallCards(
  scryfallIds: string[],
): Promise<Map<string, ScryfallCardResponse>> {
  const results = new Map<string, ScryfallCardResponse>();

  // Process in batches to respect rate limits
  // Scryfall allows ~10 requests/second, so we'll do batches of 10 with small delays
  const BATCH_SIZE = 10;
  const DELAY_MS = 100;

  for (let i = 0; i < scryfallIds.length; i += BATCH_SIZE) {
    const batch = scryfallIds.slice(i, i + BATCH_SIZE);

    // Fetch batch in parallel
    const batchResults = await Promise.all(batch.map((id) => fetchScryfallCard(id)));

    // Store results
    for (let j = 0; j < batch.length; j++) {
      const id = batch[j];
      const result = batchResults[j];
      if (id && result) {
        results.set(id, result);
      }
    }

    // Add delay between batches (except for last batch)
    if (i + BATCH_SIZE < scryfallIds.length) {
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }

  return results;
}

/**
 * Get the best image URI for a card (handles double-faced cards)
 */
export function getCardImageUri(card: ScryfallCardResponse): string | null {
  // Try normal image_uris first
  if (card.image_uris?.normal) {
    return card.image_uris.normal;
  }

  // For double-faced cards, use the first face
  if (card.card_faces?.[0]?.image_uris?.normal) {
    return card.card_faces[0].image_uris.normal;
  }

  return null;
}
