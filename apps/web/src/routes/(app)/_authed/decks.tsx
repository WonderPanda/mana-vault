import { createFileRoute } from "@tanstack/react-router";
import { ChevronRight, Plus, Swords } from "lucide-react";

import { PageContent, PageHeader, PageLayout, PageTitle } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/(app)/_authed/decks")({
  component: DecksPage,
});

// Placeholder data for decks
const placeholderDecks = [
  { id: "1", name: "Red Deck Wins", format: "MODERN", cardCount: 60 },
  { id: "2", name: "Azorius Control", format: "PIONEER", cardCount: 75 },
  { id: "3", name: "Golgari Midrange", format: "COMMANDER", cardCount: 100 },
];

function DecksPage() {
  return (
    <PageLayout>
      <PageHeader>
        <PageTitle>Decks</PageTitle>
        <Button size="icon" className="rounded-full">
          <Plus className="h-5 w-5" />
        </Button>
      </PageHeader>

      <PageContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {placeholderDecks.map((deck) => (
            <DeckCard key={deck.id} deck={deck} />
          ))}
        </div>
      </PageContent>
    </PageLayout>
  );
}

function DeckCard({
  deck,
}: {
  deck: { id: string; name: string; format: string; cardCount: number };
}) {
  return (
    <Card className="cursor-pointer transition-colors hover:bg-accent/50">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold">{deck.name}</h3>
            <div className="mt-1 flex items-center gap-2">
              <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">
                {deck.format}
              </span>
              <span className="text-xs text-muted-foreground">{deck.cardCount} cards</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Placeholder for mana colors */}
            <div className="flex -space-x-1">
              <div className="h-5 w-5 rounded-full bg-muted" />
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <Swords className="h-4 w-4 text-muted-foreground" />
        <ChevronRight className="h-5 w-5 text-muted-foreground" />
      </CardContent>
    </Card>
  );
}

// Skeleton loading state for future use
export function DeckCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-5 w-3/4" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-16 rounded" />
              <Skeleton className="h-4 w-12" />
            </div>
          </div>
          <Skeleton className="h-5 w-5 rounded-full" />
        </div>
      </CardHeader>
      <CardContent className="flex items-center justify-between">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-5 w-5" />
      </CardContent>
    </Card>
  );
}
