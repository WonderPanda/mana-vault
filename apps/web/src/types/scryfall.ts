/**
 * Scryfall API Types
 *
 * Types for interacting with the Scryfall API.
 * @see https://scryfall.com/docs/api
 */

/** Card rarity values */
export type ScryfallRarity = "common" | "uncommon" | "rare" | "mythic" | "special" | "bonus";

/** Image URIs available on a card */
export interface ScryfallImageUris {
  small?: string;
  normal?: string;
  large?: string;
  png?: string;
  art_crop?: string;
  border_crop?: string;
}

/** Card face for double-faced/split cards */
export interface ScryfallCardFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  image_uris?: ScryfallImageUris;
}

/** Scryfall card object from API */
export interface ScryfallCard {
  /** Unique Scryfall ID for this printing */
  id: string;
  /** Oracle ID grouping all printings of this card */
  oracle_id: string;
  /** Card name */
  name: string;
  /** Set code (e.g., "cmr") */
  set: string;
  /** Full set name (e.g., "Commander Legends") */
  set_name: string;
  /** Collector number within the set */
  collector_number: string;
  /** Card rarity */
  rarity: ScryfallRarity;
  /** Mana cost (e.g., "{2}{U}{U}") */
  mana_cost?: string;
  /** Converted mana cost / mana value */
  cmc: number;
  /** Type line (e.g., "Creature - Human Wizard") */
  type_line?: string;
  /** Rules text */
  oracle_text?: string;
  /** Card colors (e.g., ["U", "R"]) */
  colors?: string[];
  /** Color identity for Commander */
  color_identity?: string[];
  /** Image URIs for single-faced cards */
  image_uris?: ScryfallImageUris;
  /** Card faces for double-faced/split cards */
  card_faces?: ScryfallCardFace[];
  /** Link to Scryfall page */
  scryfall_uri: string;
  /** Whether this is a foil-only printing */
  foil?: boolean;
  /** Whether this is a non-foil printing */
  nonfoil?: boolean;
  /** Release date of the set */
  released_at?: string;
}

/** Scryfall list response (paginated) */
export interface ScryfallSearchResponse {
  object: "list";
  /** Total number of cards matching the query */
  total_cards: number;
  /** Whether more pages are available */
  has_more: boolean;
  /** URL to fetch the next page */
  next_page?: string;
  /** Cards in this page */
  data: ScryfallCard[];
}

/** Scryfall error response */
export interface ScryfallErrorResponse {
  object: "error";
  code: string;
  status: number;
  details: string;
}

/** Card with selection state for search UI */
export interface SelectedCard {
  /** The selected Scryfall card */
  card: ScryfallCard;
  /** Quantity selected */
  quantity: number;
}

/**
 * Get the best available image URI from a card.
 * Handles both single-faced and double-faced cards.
 */
export function getCardImageUri(
  card: ScryfallCard,
  size: keyof ScryfallImageUris = "normal",
): string | null {
  // Single-faced card
  if (card.image_uris) {
    return card.image_uris[size] ?? card.image_uris.normal ?? null;
  }

  // Double-faced card - use front face
  if (card.card_faces?.[0]?.image_uris) {
    return card.card_faces[0].image_uris[size] ?? card.card_faces[0].image_uris.normal ?? null;
  }

  return null;
}
