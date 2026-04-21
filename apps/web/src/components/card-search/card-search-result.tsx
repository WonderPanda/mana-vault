import { ChevronDown, ChevronUp, Minus, Plus } from "lucide-react";
import { useState } from "react";

import type { ScryfallCard } from "@/types/scryfall";
import { getCardImageUri } from "@/types/scryfall";
import { cn } from "@/lib/utils";

import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import { Skeleton } from "../ui/skeleton";
import { PrintingsPanel } from "./printings-panel";

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
