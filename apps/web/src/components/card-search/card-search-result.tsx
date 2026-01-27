import { ChevronDown, ChevronUp, Minus, Plus } from "lucide-react";
import { useState } from "react";

import type { ScryfallCard } from "@/types/scryfall";
import { getCardImageUri } from "@/types/scryfall";
import { cn } from "@/lib/utils";

import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { Skeleton } from "../ui/skeleton";
import { useScryfallPrintings } from "./use-scryfall-search";

interface CardSearchResultProps {
  /** The card to display */
  card: ScryfallCard;
  /** Whether this card is currently selected */
  isSelected: boolean;
  /** Current quantity (only shown when selected) */
  quantity: number;
  /** Called when the card selection is toggled */
  onToggleSelect: () => void;
  /** Called when quantity changes */
  onQuantityChange: (quantity: number) => void;
  /** Called when a specific printing is selected */
  onSelectPrinting?: (card: ScryfallCard) => void;
}

/**
 * A single card result in the search grid.
 * Displays card image, name, mana cost, set info, and selection controls.
 * Can be expanded to show all available printings.
 */
export function CardSearchResult({
  card,
  isSelected,
  quantity,
  onToggleSelect,
  onQuantityChange,
  onSelectPrinting,
}: CardSearchResultProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const imageUri = getCardImageUri(card, "normal");

  return (
    <div className="flex flex-col">
      <Card
        className={cn(
          "relative overflow-hidden transition-all",
          isSelected && "ring-2 ring-primary",
        )}
      >
        {/* Selection checkbox overlay */}
        <div className="absolute left-2 top-2 z-10">
          <Checkbox
            checked={isSelected}
            onCheckedChange={onToggleSelect}
            className="size-5 bg-background/80 backdrop-blur-sm"
          />
        </div>

        {/* Card image */}
        <div className="cursor-pointer" onClick={onToggleSelect}>
          {imageUri ? (
            <img
              src={imageUri}
              alt={card.name}
              className="aspect-[488/680] w-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="flex aspect-[488/680] w-full items-center justify-center bg-muted">
              <span className="text-xs text-muted-foreground">No image</span>
            </div>
          )}
        </div>

        <CardContent className="space-y-1 p-2">
          {/* Quantity controls (when selected) */}
          {isSelected && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Qty:</span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuantityChange(Math.max(1, quantity - 1));
                  }}
                  disabled={quantity <= 1}
                >
                  <Minus className="size-3" />
                </Button>
                <span className="w-6 text-center text-sm font-medium">{quantity}</span>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    onQuantityChange(quantity + 1);
                  }}
                >
                  <Plus className="size-3" />
                </Button>
              </div>
            </div>
          )}

          {/* Expand/collapse printings button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-full text-xs"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            {isExpanded ? (
              <>
                <ChevronUp className="mr-1 size-3" />
                Hide Printings
              </>
            ) : (
              <>
                <ChevronDown className="mr-1 size-3" />
                View Printings
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Expanded printings section */}
      {isExpanded && (
        <PrintingsPanel
          oracleId={card.oracle_id}
          selectedId={card.id}
          onSelectPrinting={(printing) => {
            onSelectPrinting?.(printing);
            setIsExpanded(false);
          }}
        />
      )}
    </div>
  );
}

interface PrintingsPanelProps {
  oracleId: string;
  selectedId: string;
  onSelectPrinting: (card: ScryfallCard) => void;
}

/**
 * Expandable panel showing all printings of a card.
 */
function PrintingsPanel({ oracleId, selectedId, onSelectPrinting }: PrintingsPanelProps) {
  const { data: printings, isLoading, error } = useScryfallPrintings(oracleId);

  if (isLoading) {
    return (
      <div className="mt-2 rounded-lg border bg-muted/30 p-2">
        <p className="mb-2 text-xs font-medium">Loading printings...</p>
        <div className="grid grid-cols-4 gap-1">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[488/680]" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !printings?.length) {
    return (
      <div className="mt-2 rounded-lg border bg-muted/30 p-2">
        <p className="text-xs text-muted-foreground">No other printings found</p>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-lg border bg-muted/30 p-2">
      <p className="mb-2 text-xs font-medium">
        {printings.length} printing{printings.length !== 1 ? "s" : ""} available
      </p>
      <div className="grid grid-cols-4 gap-1">
        {printings.map((printing) => {
          const printingImage = getCardImageUri(printing, "small");
          const isCurrentlySelected = printing.id === selectedId;

          return (
            <button
              key={printing.id}
              type="button"
              className={cn(
                "relative overflow-hidden rounded transition-all hover:ring-2 hover:ring-primary/50",
                isCurrentlySelected && "ring-2 ring-primary",
              )}
              onClick={() => onSelectPrinting(printing)}
              title={`${printing.set_name} #${printing.collector_number}`}
            >
              {printingImage ? (
                <img
                  src={printingImage}
                  alt={`${printing.name} - ${printing.set_name}`}
                  className="aspect-[488/680] w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex aspect-[488/680] w-full items-center justify-center bg-muted text-[8px]">
                  {printing.set.toUpperCase()}
                </div>
              )}
              {isCurrentlySelected && (
                <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                  <div className="rounded-full bg-primary p-0.5">
                    <svg
                      className="size-3 text-primary-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Skeleton loading state for card search results.
 */
export function CardSearchResultSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="aspect-[488/680]" />
      <CardContent className="p-2">
        <Skeleton className="h-7 w-full" />
      </CardContent>
    </Card>
  );
}
