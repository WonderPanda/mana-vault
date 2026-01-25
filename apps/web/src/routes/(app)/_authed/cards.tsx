import { createFileRoute } from "@tanstack/react-router";
import { ChevronRight, Plus, Square } from "lucide-react";

import { PageContent, PageHeader, PageLayout, PageTitle } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/(app)/_authed/cards")({
  component: CardsPage,
});

// Placeholder data for the collection cards
const placeholderCollections = [
  {
    id: "1",
    name: "Main Collection",
    description: "Primary playsets and staples",
    cardCount: 3,
  },
  {
    id: "2",
    name: "Rare Binder",
    description: "High value trades",
    cardCount: 1,
  },
  {
    id: "3",
    name: "Bulk Box",
    description: "Commons and Uncommons",
    cardCount: 2,
  },
  {
    id: "4",
    name: "Commander Staples",
    description: "EDH playable cards",
    cardCount: 0,
  },
];

function CardsPage() {
  return (
    <PageLayout>
      <PageHeader>
        <PageTitle>Collection</PageTitle>
        <Button size="icon" className="rounded-full">
          <Plus className="h-5 w-5" />
        </Button>
      </PageHeader>

      <PageContent>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {placeholderCollections.map((collection) => (
            <CollectionCard key={collection.id} collection={collection} />
          ))}
        </div>
      </PageContent>
    </PageLayout>
  );
}

function CollectionCard({
  collection,
}: {
  collection: {
    id: string;
    name: string;
    description: string;
    cardCount: number;
  };
}) {
  return (
    <Card className="cursor-pointer transition-colors hover:bg-accent/50">
      <CardHeader className="flex-row items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/20">
          <Square className="h-6 w-6 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="truncate font-semibold">{collection.name}</h3>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </div>
          <p className="truncate text-muted-foreground">{collection.description}</p>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{collection.cardCount} Cards</p>
      </CardContent>
    </Card>
  );
}

// Skeleton loading state for future use
export function CollectionCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex-row items-start gap-4">
        <Skeleton className="h-12 w-12 rounded-lg" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-16" />
      </CardContent>
    </Card>
  );
}
