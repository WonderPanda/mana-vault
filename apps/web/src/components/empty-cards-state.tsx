import type { LucideIcon } from "lucide-react";
import { Box, ListChecks, Plus, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";

interface EmptyCardsStateProps {
  /** The title to display */
  title?: string;
  /** The description to display */
  description?: string;
  /** The icon to display in the empty state */
  icon?: LucideIcon;
  /** Callback when the import button is clicked */
  onImportClick?: () => void;
  /** Callback when the add cards button is clicked */
  onAddClick?: () => void;
  /** Whether to show the import button */
  showImportButton?: boolean;
  /** Whether to show the add cards button */
  showAddButton?: boolean;
  /** Custom label for the import button */
  importLabel?: string;
  /** Custom label for the add button */
  addLabel?: string;
  /** Variant for styling - 'list' or 'collection' */
  variant?: "list" | "collection";
}

export function EmptyCardsState({
  title = "No cards yet",
  description,
  icon: Icon,
  onImportClick,
  onAddClick,
  showImportButton = true,
  showAddButton = true,
  importLabel = "Import",
  addLabel = "Add Cards",
  variant = "list",
}: EmptyCardsStateProps) {
  // Default icon based on variant
  const DefaultIcon = variant === "collection" ? Box : ListChecks;
  const DisplayIcon = Icon || DefaultIcon;

  // Default description based on variant
  const defaultDescription =
    variant === "collection"
      ? "This collection is empty. Import cards from a file or add them from search to get started."
      : "This list is empty. Add cards from your collection or import them from file.";

  const displayDescription = description || defaultDescription;

  const hasButtons = (showImportButton && onImportClick) || (showAddButton && onAddClick);

  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <DisplayIcon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="mb-2 text-lg font-semibold">{title}</h3>
      <p className="mb-6 max-w-sm text-muted-foreground">{displayDescription}</p>
      {hasButtons && (
        <div className="flex gap-2">
          {showImportButton && onImportClick && (
            <Button variant="outline" onClick={onImportClick}>
              <Upload className="mr-2 h-4 w-4" />
              {importLabel}
            </Button>
          )}
          {showAddButton && onAddClick && (
            <Button onClick={onAddClick}>
              <Plus className="mr-2 h-4 w-4" />
              {addLabel}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
