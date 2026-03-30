/**
 * Build a Scryfall search prefix that filters results to cards legal in Commander
 * and within the given color identity.
 *
 * Accepts an array of JSON-encoded color identity strings (e.g., '["W","U","B"]')
 * to support partner commanders with separate color identities.
 */
export function buildCommanderSearchPrefix(
  colorIdentities: (string | null | undefined)[],
): string | undefined {
  const allColors = new Set<string>();
  for (const ci of colorIdentities) {
    if (!ci) continue;
    try {
      const colors = JSON.parse(ci) as string[];
      for (const c of colors) allColors.add(c.toLowerCase());
    } catch {
      // skip malformed JSON
    }
  }
  if (allColors.size === 0) return "legal:commander";
  const identity = [...allColors].join("");
  return `legal:commander id:${identity}`;
}
