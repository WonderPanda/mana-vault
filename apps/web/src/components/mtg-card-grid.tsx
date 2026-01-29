import { useVirtualizer } from "@tanstack/react-virtual";
import { Grid2X2, List, Package, PackageCheck } from "lucide-react";
import { useEffect, useState } from "react";

import type { OwnershipStatus } from "@/hooks/use-deck-cards-by-category";
import { useGridColumns } from "@/hooks/use-grid-columns";
import { cn } from "@/lib/utils";

import { ManaCost } from "./mana-cost";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Dialog, DialogContent } from "./ui/dialog";
import { Skeleton } from "./ui/skeleton";

export type MtgCardViewMode = "grid" | "list";

export interface MtgCardData {
  id: string;
  scryfallCard: {
    name: string;
    setCode: string;
    setName: string;
    collectorNumber: string;
    imageUri: string | null;
    manaCost?: string | null;
    typeLine?: string | null;
  };
  // Card details - either from list card directly or from linked collection card
  condition?: string | null;
  isFoil?: boolean | null;
  language?: string | null;
  quantity?: number;
  // Whether this card has been added to the collection
  isInCollection?: boolean;
  // Ownership status for deck cards
  ownershipStatus?: OwnershipStatus;
}

interface MtgCardViewToggleProps {
  view: MtgCardViewMode;
  onViewChange: (view: MtgCardViewMode) => void;
  className?: string;
}

export function MtgCardViewToggle({ view, onViewChange, className }: MtgCardViewToggleProps) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        variant={view === "grid" ? "secondary" : "ghost"}
        size="icon"
        className="size-8"
        onClick={() => onViewChange("grid")}
        aria-label="Grid view"
      >
        <Grid2X2 className="size-4" />
      </Button>
      <Button
        variant={view === "list" ? "secondary" : "ghost"}
        size="icon"
        className="size-8"
        onClick={() => onViewChange("list")}
        aria-label="List view"
      >
        <List className="size-4" />
      </Button>
    </div>
  );
}

// Estimated row heights for virtualization (used as initial estimate before measurement)
const GRID_ROW_HEIGHT = 380; // Card image + metadata content + gap
const LIST_ROW_HEIGHT = 36; // Single list item height

interface VirtualizedMtgCardGridProps {
  cards: MtgCardData[];
  view?: MtgCardViewMode;
  className?: string;
  /** Ref to the scroll container element. If not provided, uses an internal container. */
  scrollElementRef?: React.RefObject<HTMLElement | null>;
  /** Callback when a card is clicked */
  onCardClick?: (card: MtgCardData) => void;
}

/**
 * Virtualized card grid/list component for rendering large card collections efficiently.
 * Supports both grid and list view modes with automatic virtualization.
 */
export function VirtualizedMtgCardGrid({
  cards,
  view = "grid",
  className,
  scrollElementRef,
  onCardClick,
}: VirtualizedMtgCardGridProps) {
  const columns = useGridColumns();

  // For grid view, we virtualize rows (each containing multiple cards)
  // For list view, we virtualize individual items
  const itemCount = view === "grid" ? Math.ceil(cards.length / columns) : cards.length;
  const estimatedSize = view === "grid" ? GRID_ROW_HEIGHT : LIST_ROW_HEIGHT;

  const virtualizer = useVirtualizer({
    count: itemCount,
    getScrollElement: () => scrollElementRef?.current ?? null,
    estimateSize: () => estimatedSize,
    overscan: view === "grid" ? 2 : 5,
  });

  // Reset virtualizer measurements when view mode or columns change
  useEffect(() => {
    virtualizer.measure();
  }, [view, columns, virtualizer]);

  return (
    // Key on view mode forces complete remount when switching views,
    // ensuring measurements are reset properly
    <div className={className} key={view}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          if (view === "list") {
            const card = cards[virtualItem.index];
            if (!card) return null;

            return (
              <div
                key={virtualItem.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <MtgCardItem
                  card={card}
                  view="list"
                  onClick={onCardClick ? () => onCardClick(card) : undefined}
                />
              </div>
            );
          }

          // Grid view: render a row of cards
          const startIndex = virtualItem.index * columns;
          const rowCards = cards.slice(startIndex, startIndex + columns);

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <div className="grid grid-cols-3 gap-2 pb-2 sm:gap-4 sm:pb-4 lg:grid-cols-4 xl:grid-cols-5">
                {rowCards.map((card) => (
                  <MtgCardItem
                    key={card.id}
                    card={card}
                    view="grid"
                    onClick={onCardClick ? () => onCardClick(card) : undefined}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface MtgCardGridProps {
  children: React.ReactNode;
  className?: string;
  view?: MtgCardViewMode;
}

/**
 * Simple non-virtualized card grid for small card lists.
 * For large lists, use VirtualizedMtgCardGrid instead.
 */
export function MtgCardGrid({ children, className, view = "grid" }: MtgCardGridProps) {
  if (view === "list") {
    return <div className={cn("flex flex-col", className)}>{children}</div>;
  }

  return (
    <div className={cn("grid grid-cols-3 gap-2 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5", className)}>
      {children}
    </div>
  );
}

interface MtgCardItemProps {
  card: MtgCardData;
  onClick?: () => void;
  view?: MtgCardViewMode;
}

export function MtgCardItem({ card, onClick, view = "grid" }: MtgCardItemProps) {
  const { scryfallCard, condition, isFoil, language, quantity, ownershipStatus } = card;
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);

  // Determine ownership icon and color
  const ownershipIcon =
    ownershipStatus === "owned-in-deck" ? (
      <PackageCheck className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
    ) : ownershipStatus === "owned-elsewhere" ? (
      <Package className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
    ) : null;

  if (view === "list") {
    return (
      <>
        <div
          className={cn(
            "flex cursor-pointer items-center justify-between gap-2 border-b border-border/50 px-2 py-1.5 hover:bg-muted/50",
          )}
          onClick={() => {
            if (onClick) {
              onClick();
            } else {
              setIsImageDialogOpen(true);
            }
          }}
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="w-5 shrink-0 text-right text-sm text-muted-foreground">
              {quantity ?? 1}
            </span>
            {ownershipIcon && <span className="shrink-0">{ownershipIcon}</span>}
            <span className="truncate text-sm">{scryfallCard.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {scryfallCard.setCode.toUpperCase()} #{scryfallCard.collectorNumber}
            </span>
            {isFoil && (
              <span className="shrink-0 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                F
              </span>
            )}
          </div>
          <ManaCost cost={scryfallCard.manaCost} className="shrink-0" />
        </div>

        <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
          <DialogContent
            className="max-w-[350px] bg-transparent p-0 ring-0 sm:max-w-[350px]"
            showCloseButton={false}
          >
            {scryfallCard.imageUri ? (
              <img
                src={scryfallCard.imageUri}
                alt={scryfallCard.name}
                className="w-full rounded-lg"
              />
            ) : (
              <div className="flex aspect-[488/680] w-full items-center justify-center rounded-lg bg-muted">
                <span className="text-muted-foreground">No image available</span>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  const hasDetails = condition || isFoil || language || ownershipStatus;

  return (
    <Card className={cn("overflow-hidden", onClick && "cursor-pointer")} onClick={onClick}>
      <div className="relative">
        {scryfallCard.imageUri ? (
          <img
            src={scryfallCard.imageUri}
            alt={scryfallCard.name}
            className="aspect-[488/680] w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex aspect-[488/680] w-full items-center justify-center bg-muted">
            <span className="text-muted-foreground">No image</span>
          </div>
        )}
        {ownershipIcon && (
          <div className="absolute -bottom-1 left-0 rounded-full bg-background/80 p-1.5 shadow-sm backdrop-blur-sm">
            {ownershipIcon}
          </div>
        )}
      </div>
      <CardContent className="px-1 py-0.5 sm:px-3 sm:py-1">
        <h4 className="hidden truncate font-medium sm:block">{scryfallCard.name}</h4>
        {/* Mobile: single line with set code, collector number, and condition */}
        <div className="flex items-center justify-between gap-1 sm:hidden">
          <p className="truncate text-[10px] text-muted-foreground">
            {scryfallCard.setCode.toUpperCase()} #{scryfallCard.collectorNumber}
          </p>
          {condition && (
            <span className="shrink-0 text-[10px] text-muted-foreground">{condition}</span>
          )}
        </div>
        {/* Desktop: full set name with code and collector number */}
        <p className="hidden truncate text-xs text-muted-foreground sm:block">
          {scryfallCard.setName} ({scryfallCard.setCode.toUpperCase()}) #
          {scryfallCard.collectorNumber}
        </p>
        {/* Desktop: badges for condition, foil, language, quantity */}
        {hasDetails && (
          <div className="hidden flex-wrap gap-1 sm:mt-1 sm:flex">
            {isFoil && (
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                Foil
              </span>
            )}
            {condition && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                {condition}
              </span>
            )}
            {language && language !== "en" && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase">
                {language}
              </span>
            )}
            {quantity && quantity > 1 && (
              <span className="rounded bg-primary/20 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                x{quantity}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface MtgCardGridSkeletonProps {
  count?: number;
  className?: string;
  view?: MtgCardViewMode;
}

export function MtgCardGridSkeleton({
  count = 10,
  className,
  view = "grid",
}: MtgCardGridSkeletonProps) {
  if (view === "list") {
    return (
      <div className={cn("flex flex-col", className)}>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-2 border-b border-border/50 px-2 py-1.5"
          >
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-5" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <MtgCardGrid className={className}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="overflow-hidden">
          <Skeleton className="aspect-[488/680]" />
          <CardContent className="space-y-1 p-1.5 sm:space-y-2 sm:p-3">
            <Skeleton className="hidden h-4 w-3/4 sm:block" />
            <Skeleton className="h-3 w-1/2" />
          </CardContent>
        </Card>
      ))}
    </MtgCardGrid>
  );
}
