import { eq, sum, useLiveQuery } from "@tanstack/react-db";

import { useDbCollections } from "@/lib/db/db-context";
import type { DeckCardDoc, ScryfallCardDoc } from "@/lib/db/db";

export type CardCategory =
  | "Creatures"
  | "Instants"
  | "Sorceries"
  | "Artifacts"
  | "Enchantments"
  | "Planeswalkers"
  | "Lands"
  | "Other";

export const CARD_CATEGORIES: CardCategory[] = [
  "Planeswalkers",
  "Creatures",
  "Instants",
  "Sorceries",
  "Artifacts",
  "Enchantments",
  "Lands",
  "Other",
];

interface CategoryConfig {
  name: CardCategory;
  matches: (typeLine: string) => boolean;
}

/**
 * Category definitions in priority order.
 * Type lines follow the pattern: "[Supertypes] [Card Types] [—] [Subtypes]"
 * Examples: "Creature — Human Wizard", "Legendary Artifact", "Basic Land — Forest"
 *
 * Cards with multiple types (e.g., "Artifact Creature") are categorized by
 * the first matching category in this order.
 */
const CATEGORY_MATCHERS: CategoryConfig[] = [
  { name: "Creatures", matches: (t) => t.includes("creature") },
  { name: "Planeswalkers", matches: (t) => t.includes("planeswalker") },
  { name: "Instants", matches: (t) => t.includes("instant") },
  { name: "Sorceries", matches: (t) => t.includes("sorcery") },
  { name: "Artifacts", matches: (t) => t.includes("artifact") },
  { name: "Enchantments", matches: (t) => t.includes("enchantment") },
  { name: "Lands", matches: (t) => t.includes("land") },
];

/**
 * Check if a card matches a specific category.
 * For "Other", we need to ensure it doesn't match any known category.
 */
function matchesCategory(typeLine: string | null | undefined, category: CardCategory): boolean {
  if (!typeLine) return category === "Other";

  const mainTypes = typeLine.split("—")[0]?.trim().toLowerCase() ?? "";

  if (category === "Other") {
    return !CATEGORY_MATCHERS.some((c) => c.matches(mainTypes));
  }

  const categoryConfig = CATEGORY_MATCHERS.find((c) => c.name === category);
  if (!categoryConfig) return false;

  // Check that this category matches AND no higher-priority category matches
  const categoryIndex = CATEGORY_MATCHERS.indexOf(categoryConfig);
  const higherPriorityMatch = CATEGORY_MATCHERS.slice(0, categoryIndex).some((c) =>
    c.matches(mainTypes),
  );

  return categoryConfig.matches(mainTypes) && !higherPriorityMatch;
}

export type DeckCardWithScryfall = DeckCardDoc & { scryfallCard: ScryfallCardDoc };

/**
 * Hook that returns deck cards filtered by MTG card category.
 * Uses TanStack DB live queries with fn.where for type line parsing.
 *
 * @param deckId - The deck ID to filter cards by
 * @param category - The card category to filter by
 * @returns Live query result with cards matching the category
 */
export function useDeckCardsByCategory(deckId: string, category: CardCategory) {
  const { deckCardCollection, scryfallCardCollection } = useDbCollections();

  return useLiveQuery(
    (q) =>
      q
        .from({ deckCard: deckCardCollection })
        .innerJoin({ card: scryfallCardCollection }, ({ card, deckCard }) =>
          eq(deckCard.preferredScryfallId, card.id),
        )
        .where(({ deckCard }) => eq(deckCard.deckId, deckId))
        .fn.where((row) => matchesCategory(row.card?.typeLine, category))
        .orderBy(({ card }) => card.name, "asc")
        .select(({ deckCard, card }) => ({ ...deckCard, scryfallCard: card })),
    [deckId, category],
  );
}

/**
 * Hook that returns all deck cards (unfiltered by category).
 * Useful for checking if a deck has any cards at all.
 */
export function useDeckCards(deckId: string) {
  const { deckCardCollection, scryfallCardCollection } = useDbCollections();

  return useLiveQuery(
    (q) =>
      q
        .from({ deckCard: deckCardCollection })
        .innerJoin({ card: scryfallCardCollection }, ({ card, deckCard }) =>
          eq(deckCard.preferredScryfallId, card.id),
        )
        .where(({ deckCard }) => eq(deckCard.deckId, deckId))
        .select(({ deckCard, card }) => ({
          ...deckCard,
          scryfallCard: card,
        })),
    [deckId],
  );
}

/**
 * Hook that returns commander cards for a deck.
 * Commander decks can have 1-2 commanders (for Partner commanders).
 */
export function useDeckCommanders(deckId: string) {
  const { deckCardCollection, scryfallCardCollection } = useDbCollections();

  return useLiveQuery(
    (q) =>
      q
        .from({ deckCard: deckCardCollection })
        .innerJoin({ card: scryfallCardCollection }, ({ card, deckCard }) =>
          eq(deckCard.preferredScryfallId, card.id),
        )
        .where(({ deckCard }) => eq(deckCard.deckId, deckId))
        .fn.where((row) => row.deckCard.isCommander === true)
        .orderBy(({ card }) => card.name, "asc")
        .select(({ deckCard, card }) => ({
          ...deckCard,
          scryfallCard: card,
        })),
    [deckId],
  );
}

/**
 * Hook that returns deck cards grouped by all categories.
 * Returns an object keyed by CardCategory with arrays of matching cards.
 */
export function useGroupedDeckCards(deckId: string) {
  const { data: creatures } = useDeckCardsByCategory(deckId, "Creatures");
  const { data: planeswalkers } = useDeckCardsByCategory(deckId, "Planeswalkers");
  const { data: instants } = useDeckCardsByCategory(deckId, "Instants");
  const { data: sorceries } = useDeckCardsByCategory(deckId, "Sorceries");
  const { data: artifacts } = useDeckCardsByCategory(deckId, "Artifacts");
  const { data: enchantments } = useDeckCardsByCategory(deckId, "Enchantments");
  const { data: lands } = useDeckCardsByCategory(deckId, "Lands");
  const { data: other } = useDeckCardsByCategory(deckId, "Other");

  return {
    Creatures: creatures,
    Planeswalkers: planeswalkers,
    Instants: instants,
    Sorceries: sorceries,
    Artifacts: artifacts,
    Enchantments: enchantments,
    Lands: lands,
    Other: other,
  } satisfies Record<CardCategory, DeckCardWithScryfall[] | undefined>;
}

/**
 * Hook that returns a single deck by ID.
 */
export function useDeck(deckId: string) {
  const { deckCollection } = useDbCollections();

  const { data, ...rest } = useLiveQuery(
    (q) => q.from({ deck: deckCollection }).where(({ deck }) => eq(deck.id, deckId)),
    [deckId],
  );

  return { data: data?.[0], ...rest };
}

/**
 * Hook that returns the total card count for a deck.
 */
export function useDeckCardCount(deckId: string) {
  const { deckCardCollection } = useDbCollections();

  const { data, ...rest } = useLiveQuery(
    (q) =>
      q
        .from({ deckCard: deckCardCollection })
        .where(({ deckCard }) => eq(deckCard.deckId, deckId))
        .groupBy(({ deckCard }) => deckCard.deckId)
        .select(({ deckCard }) => ({
          deckId: deckCard.deckId,
          cardCount: sum(deckCard.quantity),
        })),
    [deckId],
  );

  return { data: data?.[0]?.cardCount ?? 0, ...rest };
}
