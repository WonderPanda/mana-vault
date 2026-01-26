import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Card, CardContent } from "./ui/card";
import { Skeleton } from "./ui/skeleton";

export interface MtgCardData {
  id: string;
  scryfallCard: {
    name: string;
    setCode: string;
    setName: string;
    collectorNumber: string;
    imageUri: string | null;
  };
  // Card details - either from list card directly or from linked collection card
  condition?: string | null;
  isFoil?: boolean | null;
  language?: string | null;
  quantity?: number;
  // Whether this card has been added to the collection
  isInCollection?: boolean;
}

interface MtgCardGridProps {
  children: ReactNode;
  className?: string;
}

export function MtgCardGrid({ children, className }: MtgCardGridProps) {
  return (
    <div className={cn("grid grid-cols-3 gap-2 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5", className)}>
      {children}
    </div>
  );
}

interface MtgCardItemProps {
  card: MtgCardData;
  onClick?: () => void;
}

export function MtgCardItem({ card, onClick }: MtgCardItemProps) {
  const { scryfallCard, condition, isFoil, language, quantity } = card;
  const hasDetails = condition || isFoil || language;

  return (
    <Card className={cn("overflow-hidden", onClick && "cursor-pointer")} onClick={onClick}>
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
}

export function MtgCardGridSkeleton({ count = 10, className }: MtgCardGridSkeletonProps) {
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
