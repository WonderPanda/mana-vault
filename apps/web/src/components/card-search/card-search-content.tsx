import { ScanSearch, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { ScryfallCard, SelectedCard } from "@/types/scryfall";
import { cn } from "@/lib/utils";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { CardSearchResult, CardSearchResultSkeleton } from "./card-search-result";
import { useScryfallSearch } from "./use-scryfall-search";

interface CardSearchContentProps {
  /** Called when selection changes (for controlled mode) */
  onSelectionChange?: (cards: SelectedCard[]) => void;
  /** Called when user confirms their selection (for standalone mode) */
  onConfirm?: (cards: SelectedCard[]) => void;
  /** Initial search query */
  initialQuery?: string;
  /** Class name for the container */
  className?: string;
  /** Hide the footer (when dialog provides its own) */
  hideFooter?: boolean;
  /** For standalone/full-page mode - shows different footer */
  standalone?: boolean;
}

/**
 * Core card search UI component.
 * Can be used inside a dialog or as a standalone page component.
 *
 * Features:
 * - Search input with debouncing
 * - Results grid with card selection
 * - Multi-select with quantity per card
 * - Expandable printing selection
 */
export function CardSearchContent({
  onSelectionChange,
  onConfirm,
  initialQuery = "",
  className,
  hideFooter = false,
  standalone = false,
}: CardSearchContentProps) {
  const [query, setQuery] = useState(initialQuery);
  const [selectedCards, setSelectedCards] = useState<Map<string, SelectedCard>>(new Map());

  const { data, isLoading, error, search, hasSearched, searchQuery } = useScryfallSearch();

  const handleSearch = useCallback(() => {
    if (query.trim().length >= 2) {
      search(query);
    }
  }, [query, search]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSearch();
      }
    },
    [handleSearch],
  );

  // Notify parent of selection changes
  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange(Array.from(selectedCards.values()));
    }
  }, [selectedCards, onSelectionChange]);

  const handleToggleSelect = useCallback((card: ScryfallCard) => {
    setSelectedCards((prev) => {
      const next = new Map(prev);
      if (next.has(card.id)) {
        next.delete(card.id);
      } else {
        next.set(card.id, { card, quantity: 1 });
      }
      return next;
    });
  }, []);

  const handleQuantityChange = useCallback((cardId: string, quantity: number) => {
    setSelectedCards((prev) => {
      const next = new Map(prev);
      const existing = next.get(cardId);
      if (existing) {
        next.set(cardId, { ...existing, quantity });
      }
      return next;
    });
  }, []);

  const handleSelectPrinting = useCallback((originalCardId: string, newCard: ScryfallCard) => {
    setSelectedCards((prev) => {
      const next = new Map(prev);
      const existing = next.get(originalCardId);
      if (existing) {
        // Remove old card, add new one with same quantity
        next.delete(originalCardId);
        next.set(newCard.id, { card: newCard, quantity: existing.quantity });
      }
      return next;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    const cards = Array.from(selectedCards.values());
    onConfirm?.(cards);
  }, [selectedCards, onConfirm]);

  const selectedCardsList = Array.from(selectedCards.values());
  const totalQuantity = selectedCardsList.reduce((sum, sc) => sum + sc.quantity, 0);

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {/* Search input */}
      <div className="mb-4 flex shrink-0 gap-2">
        <div className="relative flex-1">
          <Input
            type="search"
            placeholder="Search cards... (e.g. 'lightning bolt' or 't:creature c:green')"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-10 rounded-lg pl-10"
            autoFocus
          />
          <ScanSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        <Button
          onClick={handleSearch}
          disabled={query.trim().length < 2 || isLoading}
          className="h-10 shrink-0"
        >
          <Search className="mr-2 h-4 w-4" />
          Search
        </Button>
      </div>

      {/* Results area - padding prevents ring border from being clipped */}
      <div className="min-h-0 flex-1 overflow-y-auto p-1 -m-1">
        {/* Empty state - no search yet */}
        {!hasSearched && (
          <div className="flex h-full flex-col items-center justify-center py-12 text-center">
            <ScanSearch className="mb-4 h-16 w-16 text-muted-foreground/50" />
            <p className="text-muted-foreground">Search for any Magic card</p>
            <p className="mt-1 text-sm text-muted-foreground/70">
              Use simple names or Scryfall syntax (e.g. "t:creature c:red mv&lt;=3")
            </p>
          </div>
        )}

        {/* Loading state */}
        {hasSearched && isLoading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <CardSearchResultSkeleton key={i} />
            ))}
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="flex h-full flex-col items-center justify-center py-12 text-center">
            <p className="text-destructive">Failed to search cards</p>
            <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
          </div>
        )}

        {/* No results */}
        {hasSearched && !isLoading && !error && data?.data.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center py-12 text-center">
            <ScanSearch className="mb-4 h-16 w-16 text-muted-foreground/50" />
            <p className="text-muted-foreground">No cards found for "{searchQuery}"</p>
            <p className="mt-1 text-sm text-muted-foreground/70">
              Try a different search term or check your spelling
            </p>
          </div>
        )}

        {/* Results grid */}
        {data && data.data.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {data.data.map((card) => {
              const selection = selectedCards.get(card.id);
              // Check if we have a different printing of this card selected
              const hasOtherPrintingSelected = Array.from(selectedCards.values()).some(
                (sc) => sc.card.oracle_id === card.oracle_id && sc.card.id !== card.id,
              );

              return (
                <CardSearchResult
                  key={card.id}
                  card={selection?.card ?? card}
                  isSelected={!!selection || hasOtherPrintingSelected}
                  quantity={selection?.quantity ?? 1}
                  onToggleSelect={() => {
                    if (hasOtherPrintingSelected && !selection) {
                      // If another printing is selected, clicking this one should select this printing instead
                      const otherSelection = Array.from(selectedCards.values()).find(
                        (sc) => sc.card.oracle_id === card.oracle_id,
                      );
                      if (otherSelection) {
                        handleSelectPrinting(otherSelection.card.id, card);
                      }
                    } else {
                      handleToggleSelect(selection?.card ?? card);
                    }
                  }}
                  onQuantityChange={(qty) =>
                    handleQuantityChange(selection?.card.id ?? card.id, qty)
                  }
                  onSelectPrinting={(newCard) =>
                    handleSelectPrinting(selection?.card.id ?? card.id, newCard)
                  }
                />
              );
            })}
          </div>
        )}

        {/* Total results info */}
        {data && data.total_cards > 0 && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Showing {data.data.length} of {data.total_cards} unique cards
            {data.has_more && " (scroll to load more)"}
          </p>
        )}
      </div>

      {/* Footer / Selection summary */}
      {!hideFooter && !standalone && (
        <div className="mt-4 shrink-0 border-t pt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {selectedCardsList.length > 0 ? (
                <>
                  {selectedCardsList.length} card{selectedCardsList.length !== 1 ? "s" : ""}{" "}
                  selected
                  {totalQuantity !== selectedCardsList.length && ` (${totalQuantity} total)`}
                </>
              ) : (
                "No cards selected"
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
