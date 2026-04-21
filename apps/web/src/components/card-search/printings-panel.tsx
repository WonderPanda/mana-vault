import type { ScryfallCard } from "@/types/scryfall";
import { getCardImageUri } from "@/types/scryfall";
import { cn } from "@/lib/utils";

import { Skeleton } from "../ui/skeleton";
import { useScryfallPrintings } from "./use-scryfall-search";

interface PrintingsPanelProps {
  oracleId: string;
  selectedId: string;
  onSelectPrinting: (card: ScryfallCard) => void;
}

/**
 * Expandable panel showing all printings of a card.
 */
export function PrintingsPanel({ oracleId, selectedId, onSelectPrinting }: PrintingsPanelProps) {
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
      <div className="grid max-h-[40vh] grid-cols-4 gap-1 overflow-y-auto overscroll-contain">
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
