/**
 * Scryfall card lookup utilities
 *
 * Provides functions to look up cards in the scryfall_card table
 * by various identifiers (set code + collector number, name, etc.)
 */

import { db } from "@mana-vault/db";
import { scryfallCard } from "@mana-vault/db/schema/app";
import { and, eq, like } from "drizzle-orm";

import type { MoxfieldRow } from "../parsers/moxfield";

/**
 * Look up a Scryfall card by set code and collector number.
 * Falls back to name-based lookup if exact match not found.
 *
 * @param row - The parsed Moxfield row with card info
 * @returns The matching scryfall card or null if not found
 */
export async function lookupScryfallCard(
  row: MoxfieldRow,
): Promise<{ id: string; oracleId: string } | null> {
  // First try exact match by set code + collector number (lowercase)
  const [exactMatch] = await db
    .select({ id: scryfallCard.id, oracleId: scryfallCard.oracleId })
    .from(scryfallCard)
    .where(
      and(
        eq(scryfallCard.setCode, row.setCode.toLowerCase()),
        eq(scryfallCard.collectorNumber, row.collectorNumber),
      ),
    )
    .limit(1);

  if (exactMatch) {
    return exactMatch;
  }

  // Try with uppercase set code (some exports may vary)
  const [upperMatch] = await db
    .select({ id: scryfallCard.id, oracleId: scryfallCard.oracleId })
    .from(scryfallCard)
    .where(
      and(
        eq(scryfallCard.setCode, row.setCode.toUpperCase()),
        eq(scryfallCard.collectorNumber, row.collectorNumber),
      ),
    )
    .limit(1);

  if (upperMatch) {
    return upperMatch;
  }

  // Fall back to name match - try exact name first
  const [nameMatch] = await db
    .select({ id: scryfallCard.id, oracleId: scryfallCard.oracleId })
    .from(scryfallCard)
    .where(eq(scryfallCard.name, row.name))
    .limit(1);

  if (nameMatch) {
    return nameMatch;
  }

  // For double-faced cards, try matching just the front face name
  // Moxfield format: "Front Face / Back Face"
  // Scryfall format might be: "Front Face // Back Face"
  if (row.name.includes(" / ")) {
    const frontFace = row.name.split(" / ")[0]?.trim();
    if (frontFace) {
      // Try matching cards that start with the front face name
      const [frontMatch] = await db
        .select({ id: scryfallCard.id, oracleId: scryfallCard.oracleId })
        .from(scryfallCard)
        .where(like(scryfallCard.name, `${frontFace} //%`))
        .limit(1);

      if (frontMatch) {
        return frontMatch;
      }

      // Also try just the front face name alone (some cards)
      const [frontOnlyMatch] = await db
        .select({ id: scryfallCard.id, oracleId: scryfallCard.oracleId })
        .from(scryfallCard)
        .where(eq(scryfallCard.name, frontFace))
        .limit(1);

      if (frontOnlyMatch) {
        return frontOnlyMatch;
      }
    }
  }

  return null;
}
