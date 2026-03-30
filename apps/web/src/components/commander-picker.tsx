import { X } from "lucide-react";
import { useState } from "react";

import type { ScryfallCard } from "@/types/scryfall";
import { getCardImageUri } from "@/types/scryfall";

import { CommanderSearchDialog } from "./commander-search-dialog";
import { Button } from "./ui/button";
import { Label } from "./ui/label";

interface CommanderPickerProps {
  selectedCommander: ScryfallCard | null;
  onSelect: (card: ScryfallCard) => void;
  onClear: () => void;
  helperText?: string;
}

/**
 * Form field for selecting a commander card.
 * Shows a thumbnail + name when selected, or a "Set Commander" button when empty.
 * Includes the CommanderSearchDialog internally.
 */
export function CommanderPicker({
  selectedCommander,
  onSelect,
  onClear,
  helperText,
}: CommanderPickerProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const imageUri = selectedCommander ? getCardImageUri(selectedCommander, "small") : null;

  return (
    <div className="grid gap-2">
      <Label>Commander (optional)</Label>
      {selectedCommander ? (
        <div className="flex items-center gap-3 rounded-lg border p-2">
          {imageUri && (
            <img
              src={imageUri}
              alt={selectedCommander.name}
              className="h-14 w-10 rounded object-cover"
            />
          )}
          <span className="min-w-0 flex-1 truncate text-sm font-medium">
            {selectedCommander.name}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={onClear}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="justify-start"
          onClick={() => setIsSearchOpen(true)}
        >
          Set Commander
        </Button>
      )}
      {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}

      <CommanderSearchDialog
        open={isSearchOpen}
        onOpenChange={setIsSearchOpen}
        onSelect={onSelect}
      />
    </div>
  );
}
