import { ScanSearch, Search } from "lucide-react";
import { useCallback, useState } from "react";

import type { ScryfallCard } from "@/types/scryfall";
import { getCardImageUri } from "@/types/scryfall";
import { useScryfallSearch } from "@/components/card-search/use-scryfall-search";

import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Skeleton } from "./ui/skeleton";

interface CommanderSearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (card: ScryfallCard) => void;
}

/**
 * Single-select dialog for searching and picking a commander card.
 * Pre-filters results to legal commanders using Scryfall's `is:commander` syntax.
 */
export function CommanderSearchDialog({
  open,
  onOpenChange,
  onSelect,
}: CommanderSearchDialogProps) {
  const [query, setQuery] = useState("");
  const { data, isLoading, error, search, hasSearched, searchQuery } = useScryfallSearch();

  const handleSearch = useCallback(() => {
    const trimmed = query.trim();
    if (trimmed.length >= 2) {
      search(`is:commander ${trimmed}`);
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

  const handleSelect = useCallback(
    (card: ScryfallCard) => {
      onSelect(card);
      onOpenChange(false);
      setQuery("");
    },
    [onSelect, onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[80vh] max-h-[700px] flex-col sm:max-w-3xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>Search Commander</DialogTitle>
          <DialogDescription>
            Search for a legendary creature or other valid commander.
          </DialogDescription>
        </DialogHeader>

        {/* Search input */}
        <div className="flex shrink-0 gap-2">
          <div className="relative flex-1">
            <Input
              type="search"
              placeholder="Search commanders... (e.g. 'Atraxa' or 'c:WUBG')"
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

        {/* Results */}
        <div className="min-h-0 flex-1 overflow-y-auto p-1 -m-1">
          {!hasSearched && (
            <div className="flex h-full flex-col items-center justify-center py-12 text-center">
              <ScanSearch className="mb-4 h-16 w-16 text-muted-foreground/50" />
              <p className="text-muted-foreground">Search for a commander</p>
              <p className="mt-1 text-sm text-muted-foreground/70">
                Results are filtered to legal commanders
              </p>
            </div>
          )}

          {hasSearched && isLoading && (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="aspect-[488/680] w-full rounded-lg" />
              ))}
            </div>
          )}

          {error && (
            <div className="flex h-full flex-col items-center justify-center py-12 text-center">
              <p className="text-destructive">Failed to search cards</p>
              <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
            </div>
          )}

          {hasSearched && !isLoading && !error && data?.data.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center py-12 text-center">
              <ScanSearch className="mb-4 h-16 w-16 text-muted-foreground/50" />
              <p className="text-muted-foreground">No commanders found for "{searchQuery}"</p>
            </div>
          )}

          {data && data.data.length > 0 && (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {data.data.map((card) => {
                const imageUri = getCardImageUri(card, "normal");
                return (
                  <button
                    key={card.id}
                    type="button"
                    className="group relative cursor-pointer overflow-hidden rounded-lg ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 hover:ring-2 hover:ring-primary"
                    onClick={() => handleSelect(card)}
                  >
                    {imageUri ? (
                      <img
                        src={imageUri}
                        alt={card.name}
                        className="aspect-[488/680] w-full rounded-lg object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex aspect-[488/680] w-full items-center justify-center rounded-lg bg-muted">
                        <span className="text-xs text-muted-foreground">{card.name}</span>
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                      <p className="truncate text-xs font-medium text-white">{card.name}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {data && data.total_cards > 0 && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Showing {data.data.length} of {data.total_cards} commanders
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
