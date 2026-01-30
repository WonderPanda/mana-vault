import { useCallback, useRef, useState } from "react";

import type { SelectedCard } from "@/types/scryfall";

import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { CardSearchContent } from "./card-search-content";

interface CardSearchDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Callback when cards are selected and confirmed */
  onSelect: (cards: SelectedCard[], options?: { addToCollection?: boolean }) => void;
  /** Optional title override */
  title?: string;
  /** Optional description override */
  description?: string;
  /** Show the "I own these cards" toggle */
  showCollectionToggle?: boolean;
}

/**
 * A dialog for searching and selecting Magic cards.
 *
 * Features:
 * - Full-featured card search via Scryfall API
 * - Multi-select with quantity per card
 * - Printing selection for each card
 * - Responsive layout for all screen sizes
 *
 * @example
 * ```tsx
 * const [isOpen, setIsOpen] = useState(false);
 *
 * <CardSearchDialog
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   onSelect={(cards) => {
 *     console.log('Selected:', cards);
 *     setIsOpen(false);
 *   }}
 *   title="Add Cards to Deck"
 * />
 * ```
 */
export function CardSearchDialog({
  open,
  onOpenChange,
  onSelect,
  title = "Search Cards",
  description = "Search for Magic cards to add. You can select multiple cards and specify quantities.",
  showCollectionToggle = false,
}: CardSearchDialogProps) {
  const [selectedCards, setSelectedCards] = useState<SelectedCard[]>([]);
  const [addToCollection, setAddToCollection] = useState(false);
  const contentKeyRef = useRef(0);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    // Reset state after dialog animation completes
    setTimeout(() => {
      setSelectedCards([]);
      setAddToCollection(false);
      contentKeyRef.current += 1;
    }, 200);
  }, [onOpenChange]);

  const handleSelectionChange = useCallback((cards: SelectedCard[]) => {
    setSelectedCards(cards);
  }, []);

  const handleSubmit = useCallback(() => {
    if (selectedCards.length > 0) {
      onSelect(selectedCards, { addToCollection });
      handleClose();
    }
  }, [selectedCards, onSelect, handleClose, addToCollection]);

  const totalQuantity = selectedCards.reduce((sum, sc) => sum + sc.quantity, 0);

  return (
    <Dialog open={open} onOpenChange={handleClose} dismissible={false}>
      <DialogContent className="flex h-[90vh] max-h-[900px] flex-col sm:max-w-4xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1">
          <CardSearchContent
            key={contentKeyRef.current}
            onSelectionChange={handleSelectionChange}
            className="h-full"
            hideFooter
          />
        </div>

        <DialogFooter className="shrink-0 gap-2 sm:gap-0">
          <div className="flex w-full items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                {selectedCards.length > 0 ? (
                  <>
                    {selectedCards.length} card{selectedCards.length !== 1 ? "s" : ""} selected
                    {totalQuantity !== selectedCards.length && ` (${totalQuantity} total)`}
                  </>
                ) : (
                  "No cards selected"
                )}
              </span>
              {showCollectionToggle && (
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={addToCollection}
                    onCheckedChange={(checked) => setAddToCollection(checked === true)}
                  />
                  <span className="text-sm">I own these cards</span>
                </label>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={selectedCards.length === 0}>
                Add{" "}
                {selectedCards.length > 0
                  ? `${totalQuantity} Card${totalQuantity !== 1 ? "s" : ""}`
                  : "Cards"}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
