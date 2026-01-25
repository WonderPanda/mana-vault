import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, Box } from "lucide-react";

import { PageContent, PageHeader, PageLayout, PageTitle } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/(app)/_authed/cards/$collectionId")({
  component: CollectionDetailPage,
  beforeLoad: async ({ context: { queryClient }, params }) => {
    await Promise.all([
      queryClient.ensureQueryData(
        orpc.collections.get.queryOptions({ input: { id: params.collectionId } }),
      ),
      queryClient.ensureQueryData(
        orpc.collections.getCards.queryOptions({
          input: { collectionId: params.collectionId },
        }),
      ),
    ]);
  },
});

function CollectionDetailPage() {
  const { collectionId } = Route.useParams();
  const { data: collection } = useSuspenseQuery(
    orpc.collections.get.queryOptions({ input: { id: collectionId } }),
  );
  const { data: cards } = useSuspenseQuery(
    orpc.collections.getCards.queryOptions({ input: { collectionId } }),
  );

  const TypeIcon = collection.type === "binder" ? BookOpen : Box;

  return (
    <PageLayout>
      <PageHeader>
        <div className="flex items-center gap-3">
          <Link to="/cards">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
              <TypeIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <PageTitle>{collection.name}</PageTitle>
              {collection.description && (
                <p className="text-sm text-muted-foreground">{collection.description}</p>
              )}
            </div>
          </div>
        </div>
      </PageHeader>

      <PageContent>
        {cards.length === 0 ? (
          <EmptyCardsState />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {cards.map((card) => (
              <CollectionCardItem key={card.id} card={card} />
            ))}
          </div>
        )}
      </PageContent>
    </PageLayout>
  );
}

function EmptyCardsState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Box className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="mb-2 text-lg font-semibold">No cards yet</h3>
      <p className="max-w-sm text-muted-foreground">
        This collection is empty. Add cards from your search or import them to get started.
      </p>
    </div>
  );
}

interface CollectionCardItemProps {
  card: {
    id: string;
    condition: string;
    isFoil: boolean;
    language: string;
    notes: string | null;
    assignedAt: Date;
    card: {
      id: string;
      name: string;
      setCode: string;
      setName: string;
      collectorNumber: string;
      rarity: string;
      imageUri: string | null;
    } | null;
  };
}

function CollectionCardItem({ card }: CollectionCardItemProps) {
  if (!card.card) return null;

  return (
    <Card className="overflow-hidden">
      <div className="aspect-[488/680] bg-muted">
        {card.card.imageUri ? (
          <img
            src={card.card.imageUri}
            alt={card.card.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="text-sm text-muted-foreground">No image</span>
          </div>
        )}
      </div>
      <CardContent className="p-3">
        <h4 className="truncate font-medium">{card.card.name}</h4>
        <p className="text-xs text-muted-foreground">
          {card.card.setName} #{card.card.collectorNumber}
        </p>
        <div className="mt-1 flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">{card.condition}</span>
          {card.isFoil && (
            <span className="rounded bg-yellow-500/20 px-1 text-yellow-600">Foil</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function CollectionDetailSkeleton() {
  return (
    <PageLayout>
      <PageHeader>
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
      </PageHeader>
      <PageContent>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="aspect-[488/680]" />
              <CardContent className="space-y-2 p-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </PageContent>
    </PageLayout>
  );
}
