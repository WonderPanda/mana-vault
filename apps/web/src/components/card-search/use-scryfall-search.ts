import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import type { ScryfallCard, ScryfallSearchResponse } from "@/types/scryfall";

const SCRYFALL_API_BASE = "https://api.scryfall.com";

/**
 * Scryfall query operators that indicate advanced syntax is being used.
 * When these are detected, we pass the query through as-is instead of wrapping with name:.
 * @see https://scryfall.com/docs/syntax
 */
const SCRYFALL_OPERATORS = [
  // Card characteristics
  "c:",
  "color:",
  "id:",
  "identity:",
  "t:",
  "type:",
  "o:",
  "oracle:",
  "m:",
  "mana:",
  "mv:",
  "cmc:",
  "pow:",
  "power:",
  "tou:",
  "tough:",
  "toughness:",
  "pt:",
  "loy:",
  "loyalty:",
  "def:",
  "defense:",
  // Card text/names
  "name:",
  "n:",
  "fo:",
  "fulltext:",
  "ft:",
  "flavor:",
  "a:",
  "artist:",
  "keyword:",
  "kw:",
  // Sets/printings
  "s:",
  "set:",
  "cn:",
  "number:",
  "b:",
  "block:",
  "st:",
  "e:",
  "edition:",
  "r:",
  "rarity:",
  "in:",
  // Format legality
  "f:",
  "format:",
  "banned:",
  "restricted:",
  "legal:",
  // Prices/availability
  "usd:",
  "eur:",
  "tix:",
  "is:",
  "has:",
  // Game/misc
  "game:",
  "year:",
  "date:",
  "lang:",
  "new:",
  "oracleid:",
  "oracleid=",
  // Comparison operators (commonly used)
  ">=",
  "<=",
  "!=",
  "<>",
  // Boolean/grouping
  " or ",
  " and ",
  " -",
  "(-",
  "(c:",
  "(t:",
  "(o:",
];

/**
 * Detects if a query uses Scryfall's advanced search syntax.
 */
function isAdvancedQuery(query: string): boolean {
  const lowerQuery = query.toLowerCase();
  return SCRYFALL_OPERATORS.some((op) => lowerQuery.includes(op.toLowerCase()));
}

/**
 * Fetches cards from Scryfall API.
 * Respects Scryfall's rate limiting guidelines.
 */
async function searchScryfall(query: string, unique = true): Promise<ScryfallSearchResponse> {
  // If query contains Scryfall operators, use it as-is; otherwise search by name
  const searchQuery = isAdvancedQuery(query) ? query : `name:${query}`;
  const uniqueParam = unique ? "cards" : "prints";

  const url = new URL(`${SCRYFALL_API_BASE}/cards/search`);
  url.searchParams.set("q", searchQuery);
  url.searchParams.set("unique", uniqueParam);
  url.searchParams.set("order", "name");

  const response = await fetch(url.toString());

  if (!response.ok) {
    // Scryfall returns 404 for no results
    if (response.status === 404) {
      return {
        object: "list",
        total_cards: 0,
        has_more: false,
        data: [],
      };
    }
    throw new Error(`Scryfall API error: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetches all printings of a card by oracle ID.
 */
async function fetchPrintings(oracleId: string): Promise<ScryfallCard[]> {
  const url = new URL(`${SCRYFALL_API_BASE}/cards/search`);
  url.searchParams.set("q", `oracleid:${oracleId}`);
  url.searchParams.set("unique", "prints");
  url.searchParams.set("order", "released");
  url.searchParams.set("dir", "desc");

  const response = await fetch(url.toString());

  if (!response.ok) {
    if (response.status === 404) {
      return [];
    }
    throw new Error(`Scryfall API error: ${response.status}`);
  }

  const data: ScryfallSearchResponse = await response.json();
  return data.data;
}

/**
 * Hook for searching cards on Scryfall.
 *
 * Features:
 * - Manual search trigger (no auto-search/debounce)
 * - Caches results with TanStack Query
 * - Returns unique cards (grouped by oracle_id)
 * - Supports both simple name search and advanced Scryfall syntax
 *
 * @param options - Query options
 * @returns Query result and search control functions
 */
export function useScryfallSearch(options?: { enabled?: boolean }) {
  const { enabled = true } = options ?? {};

  const [searchQuery, setSearchQuery] = useState<string | null>(null);

  // Only search if we have a query with at least 2 characters
  const shouldSearch = enabled && searchQuery !== null && searchQuery.length >= 2;

  const query = useQuery({
    queryKey: ["scryfall-search", searchQuery],
    queryFn: () => searchScryfall(searchQuery!),
    enabled: shouldSearch,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const search = useCallback((query: string) => {
    const trimmed = query.trim();
    if (trimmed.length >= 2) {
      setSearchQuery(trimmed);
    }
  }, []);

  const clear = useCallback(() => {
    setSearchQuery(null);
  }, []);

  return {
    ...query,
    searchQuery,
    search,
    clear,
    hasSearched: searchQuery !== null,
  };
}

/**
 * Hook for fetching all printings of a specific card.
 *
 * @param oracleId - The oracle ID of the card
 * @param options - Query options
 */
export function useScryfallPrintings(
  oracleId: string | null,
  options?: {
    enabled?: boolean;
  },
) {
  const { enabled = true } = options ?? {};

  return useQuery({
    queryKey: ["scryfall-printings", oracleId],
    queryFn: () => fetchPrintings(oracleId!),
    enabled: enabled && !!oracleId,
    staleTime: 10 * 60 * 1000, // Cache for 10 minutes
    gcTime: 60 * 60 * 1000, // Keep in cache for 1 hour
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
