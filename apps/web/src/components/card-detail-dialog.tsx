import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { MtgCardData } from "./mtg-card-grid";
import { Dialog, DialogContent } from "./ui/dialog";

export interface CardDetailAction {
  icon: React.ReactNode;
  label: string;
  onClick: (card: MtgCardData) => void;
  variant?: "default" | "destructive";
}

interface CardDetailDialogProps {
  cards: MtgCardData[];
  selectedIndex: number | null;
  onClose: () => void;
  actions?: CardDetailAction[];
}

export function CardDetailDialog({
  cards,
  selectedIndex,
  onClose,
  actions,
}: CardDetailDialogProps) {
  const [currentIndex, setCurrentIndex] = useState(selectedIndex ?? 0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Sync internal index when selectedIndex changes (dialog opens on a new card)
  useEffect(() => {
    if (selectedIndex !== null) {
      setCurrentIndex(selectedIndex);
    }
  }, [selectedIndex]);

  // Clamp index when cards array shrinks (e.g., after card removal)
  useEffect(() => {
    if (selectedIndex === null) return;
    if (cards.length === 0) {
      onClose();
    } else if (currentIndex >= cards.length) {
      setCurrentIndex(cards.length - 1);
    }
  }, [cards.length, currentIndex, selectedIndex, onClose]);

  const isOpen = selectedIndex !== null;
  const card = cards[currentIndex];
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < cards.length - 1;

  const goToPrev = useCallback(() => {
    setCurrentIndex((i) => Math.max(0, i - 1));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentIndex((i) => Math.min(cards.length - 1, i + 1));
  }, [cards.length]);

  // Keyboard navigation — handled on the popup element directly so it fires
  // before the dialog's focus-trap can consume arrow keys for button focus
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "h") {
        e.preventDefault();
        e.stopPropagation();
        goToPrev();
      } else if (e.key === "ArrowRight" || e.key === "l") {
        e.preventDefault();
        e.stopPropagation();
        goToNext();
      }
    },
    [goToPrev, goToNext],
  );

  // Preload adjacent card images
  useEffect(() => {
    if (!isOpen) return;

    const preload = (index: number) => {
      const uri = cards[index]?.scryfallCard.imageUri;
      if (uri) {
        const img = new Image();
        img.src = uri;
      }
    };

    if (hasPrev) preload(currentIndex - 1);
    if (hasNext) preload(currentIndex + 1);
  }, [isOpen, currentIndex, cards, hasPrev, hasNext]);

  // Touch/swipe handlers
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) {
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    }
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const start = touchStartRef.current;
      const touch = e.changedTouches[0];
      if (!start || !touch) return;

      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      touchStartRef.current = null;

      // Only count as swipe if horizontal movement is dominant and > 50px
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0) {
          goToNext();
        } else {
          goToPrev();
        }
      }
    },
    [goToNext, goToPrev],
  );

  if (!card) return null;

  const { scryfallCard, condition, isFoil, language, quantity, ownershipStatus } = card;
  const price = isFoil ? scryfallCard.priceUsdFoil : scryfallCard.priceUsd;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-[400px] bg-transparent p-0 ring-0 sm:max-w-[400px]"
        showCloseButton={false}
        onKeyDown={handleKeyDown}
      >
        <div
          ref={contentRef}
          className="relative select-none"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {/* Navigation arrows - desktop */}
          {hasPrev && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goToPrev();
              }}
              className="absolute top-1/2 -left-12 z-10 hidden -translate-y-1/2 rounded-full bg-background/80 p-1.5 text-foreground shadow-md backdrop-blur-sm transition-opacity hover:bg-background sm:block"
              aria-label="Previous card"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          {hasNext && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                goToNext();
              }}
              className="absolute top-1/2 -right-12 z-10 hidden -translate-y-1/2 rounded-full bg-background/80 p-1.5 text-foreground shadow-md backdrop-blur-sm transition-opacity hover:bg-background sm:block"
              aria-label="Next card"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}

          {/* Card image */}
          {scryfallCard.imageUri ? (
            <img
              src={scryfallCard.imageUri}
              alt={scryfallCard.name}
              className="w-full rounded-lg"
              draggable={false}
            />
          ) : (
            <div className="flex aspect-[488/680] w-full items-center justify-center rounded-lg bg-muted">
              <span className="text-muted-foreground">No image available</span>
            </div>
          )}

          {/* Card info */}
          <div className="mt-2 rounded-lg bg-background/90 px-3 py-2 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-2">
              <h4 className="truncate font-medium text-sm">{scryfallCard.name}</h4>
              <div className="flex shrink-0 items-center gap-2">
                {price != null && <span className="text-sm font-bold">${price.toFixed(2)}</span>}
                <span className="text-xs text-muted-foreground">
                  {currentIndex + 1} / {cards.length}
                </span>
              </div>
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {scryfallCard.setName} ({scryfallCard.setCode.toUpperCase()}) #
              {scryfallCard.collectorNumber}
            </p>
            {(condition || isFoil || language || ownershipStatus) && (
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

          {/* Action toolbar */}
          {actions && actions.length > 0 && (
            <div className="mt-2 flex items-center justify-center gap-1 rounded-lg bg-background/90 px-3 py-2 backdrop-blur-sm">
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => action.onClick(card)}
                  className={`rounded-lg p-2.5 transition-colors ${
                    action.variant === "destructive"
                      ? "text-destructive hover:bg-destructive/10"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  aria-label={action.label}
                  title={action.label}
                >
                  {action.icon}
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
