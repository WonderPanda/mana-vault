import { useVirtualizer } from "@tanstack/react-virtual";
import { Grid2X2, List, Package, PackageCheck, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { OwnershipStatus } from "@/hooks/use-deck-cards";
import { useGridColumns } from "@/hooks/use-grid-columns";
import { cn } from "@/lib/utils";

import { CardDetailDialog } from "./card-detail-dialog";
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
    priceUsd?: number | null;
    priceUsdFoil?: number | null;
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
  /** Callback when a card's remove button is clicked. Shows remove button when provided. */
  onRemoveCard?: (card: MtgCardData) => void;
  /** When true, cards show prominent always-visible remove buttons */
  removeMode?: boolean;
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
  onRemoveCard,
  removeMode,
}: VirtualizedMtgCardGridProps) {
  const columns = useGridColumns();
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);

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

  // When no onCardClick is provided, clicking a card opens the navigation dialog
  const handleCardClick = onCardClick ? undefined : (index: number) => setSelectedCardIndex(index);

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
            const cardIndex = virtualItem.index;

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
                  onClick={
                    onCardClick
                      ? () => onCardClick(card)
                      : handleCardClick
                        ? () => handleCardClick(cardIndex)
                        : undefined
                  }
                  onRemove={onRemoveCard ? () => onRemoveCard(card) : undefined}
                  removeMode={removeMode}
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
                {rowCards.map((card, i) => {
                  const cardIndex = startIndex + i;
                  return (
                    <MtgCardItem
                      key={card.id}
                      card={card}
                      view="grid"
                      onClick={
                        onCardClick
                          ? () => onCardClick(card)
                          : handleCardClick
                            ? () => handleCardClick(cardIndex)
                            : undefined
                      }
                      onRemove={onRemoveCard ? () => onRemoveCard(card) : undefined}
                      removeMode={removeMode}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {!onCardClick && (
        <CardDetailDialog
          cards={cards}
          selectedIndex={selectedCardIndex}
          onClose={() => setSelectedCardIndex(null)}
        />
      )}
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
  onRemove?: () => void;
  view?: MtgCardViewMode;
  removeMode?: boolean;
}

export function MtgCardItem({
  card,
  onClick,
  onRemove,
  view = "grid",
  removeMode,
}: MtgCardItemProps) {
  const { scryfallCard, condition, isFoil, language, quantity, ownershipStatus } = card;
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false);

  // Determine ownership icon and color
  const ownershipIcon =
    ownershipStatus === "owned-in-deck" ? (
      <PackageCheck className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
    ) : ownershipStatus === "owned-elsewhere" ? (
      <Package className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
    ) : null;

  const hasDetails = condition || isFoil || language || ownershipStatus;
  const price = isFoil ? scryfallCard.priceUsdFoil : scryfallCard.priceUsd;

  const imageDialogContent = (
    <>
      {scryfallCard.imageUri ? (
        <img src={scryfallCard.imageUri} alt={scryfallCard.name} className="w-full rounded-lg" />
      ) : (
        <div className="flex aspect-[488/680] w-full items-center justify-center rounded-lg bg-muted">
          <span className="text-muted-foreground">No image available</span>
        </div>
      )}
      <div className="mt-2 rounded-lg bg-background/90 px-3 py-2 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-2">
          <h4 className="truncate font-medium text-sm">{scryfallCard.name}</h4>
          {price != null && <span className="shrink-0 text-sm font-bold">${price.toFixed(2)}</span>}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {scryfallCard.setName} ({scryfallCard.setCode.toUpperCase()}) #
          {scryfallCard.collectorNumber}
        </p>
        {hasDetails && (
          <div className="mt-1.5 flex flex-wrap gap-1">
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
      </div>
    </>
  );

  if (view === "list") {
    return (
      <>
        <div
          className={cn(
            "group/listitem flex cursor-pointer items-center justify-between gap-2 border-b border-border/50 px-2 py-1.5 hover:bg-muted/50",
            removeMode && "bg-destructive/5",
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
          <div className="flex shrink-0 items-center gap-2">
            {price != null && (
              <span className="text-xs text-muted-foreground font-bold">${price.toFixed(2)}</span>
            )}
            <ManaCost cost={scryfallCard.manaCost} className="shrink-0" />
            {onRemove && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className={cn(
                  "rounded p-0.5 transition-opacity",
                  removeMode
                    ? "text-destructive opacity-100"
                    : "text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive group-hover/listitem:opacity-100",
                )}
                aria-label={`Remove ${scryfallCard.name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
          <DialogContent
            className="max-w-[350px] bg-transparent p-0 ring-0 sm:max-w-[350px]"
            showCloseButton={false}
          >
            {imageDialogContent}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <Card
        className={cn(
          "group/card gap-0 overflow-hidden pt-0 pb-1 sm:pb-1.5",
          "cursor-pointer",
          removeMode && "ring-2 ring-destructive/30",
        )}
        onClick={() => {
          if (onClick) {
            onClick();
          } else {
            setIsImageDialogOpen(true);
          }
        }}
      >
        <div className="relative overflow-hidden rounded-lg">
          {onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className={cn(
                "absolute top-1 right-1 z-10 rounded-full shadow-sm transition-opacity",
                removeMode
                  ? "bg-destructive p-1.5 text-destructive-foreground opacity-100"
                  : "bg-background/80 p-1 text-muted-foreground opacity-0 backdrop-blur-sm hover:bg-destructive/20 hover:text-destructive group-hover/card:opacity-100",
              )}
              aria-label={`Remove ${scryfallCard.name}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
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
          {price != null && (
            <p className="text-[10px] font-bold text-muted-foreground sm:text-xs">
              ${price.toFixed(2)}
            </p>
          )}
          {/* Desktop: badges for condition, foil, language, quantity */}
          {hasDetails && (
            <div className="hidden flex-wrap gap-1 sm:flex">
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

      <Dialog open={isImageDialogOpen} onOpenChange={setIsImageDialogOpen}>
        <DialogContent
          className="max-w-[350px] bg-transparent p-0 ring-0 sm:max-w-[350px]"
          showCloseButton={false}
        >
          {imageDialogContent}
        </DialogContent>
      </Dialog>
    </>
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
