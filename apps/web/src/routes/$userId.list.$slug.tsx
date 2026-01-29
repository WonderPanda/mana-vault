import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Gift, Heart, ListChecks, ShoppingCart, Sparkles } from "lucide-react";
import { useRef, useState } from "react";

import { EmptyCardsState } from "@/components/empty-cards-state";
import {
  MtgCardGridSkeleton,
  MtgCardViewToggle,
  VirtualizedMtgCardGrid,
  type MtgCardViewMode,
} from "@/components/mtg-card-grid";
import { PageContent, PageHeader, PageLayout, PageTitle } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/$userId/list/$slug")({
  component: PublicListPage,
  beforeLoad: async ({ context: { queryClient }, params }) => {
    await Promise.all([
      queryClient.ensureQueryData(
        orpc.lists.getPublicList.queryOptions({
          input: { userId: params.userId, slug: params.slug },
        }),
      ),
      queryClient.ensureQueryData(
        orpc.lists.getPublicListCards.queryOptions({
          input: { userId: params.userId, slug: params.slug },
        }),
      ),
    ]);
  },
});

function PublicListPage() {
  const { userId, slug } = Route.useParams();
  const { data: list } = useSuspenseQuery(
    orpc.lists.getPublicList.queryOptions({
      input: { userId, slug },
    }),
  );
  const { data: cards } = useSuspenseQuery(
    orpc.lists.getPublicListCards.queryOptions({
      input: { userId, slug },
    }),
  );
  const [viewMode, setViewMode] = useState<MtgCardViewMode>("grid");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const TypeIcon = getListTypeIcon(list.listType, list.sourceType);
  const isWishlist = list.listType === "wishlist";

  return (
    <PageLayout>
      <PageHeader>
        <div className="flex items-center gap-3">
          <Link to="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-lg ${isWishlist ? "bg-pink-500/20" : "bg-primary/20"}`}
            >
              <TypeIcon className={`h-5 w-5 ${isWishlist ? "text-pink-500" : "text-primary"}`} />
            </div>
            <div>
              <PageTitle>{list.name}</PageTitle>
              {list.description && (
                <p className="text-sm text-muted-foreground">{list.description}</p>
              )}
            </div>
          </div>
        </div>
        <div className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          Public List
        </div>
      </PageHeader>

      <PageContent ref={scrollContainerRef}>
        {/* List metadata */}
        <div className="mb-6 flex flex-wrap gap-4 text-sm text-muted-foreground">
          <div>
            <span className="font-medium">Type:</span>{" "}
            {list.listType === "wishlist" ? "Wishlist" : "Owned"}
          </div>
          {list.sourceType && (
            <div>
              <span className="font-medium">Source:</span> {getSourceTypeLabel(list.sourceType)}
            </div>
          )}
          {list.sourceName && (
            <div>
              <span className="font-medium">From:</span> {list.sourceName}
            </div>
          )}
          <div>
            <span className="font-medium">Cards:</span> {list.cardCount}
          </div>
          <div>
            <span className="font-medium">Created:</span>{" "}
            {new Date(list.createdAt).toLocaleDateString()}
          </div>
        </div>

        {/* Cards section */}
        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
            <ListChecks className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold">No cards in this list</h3>
            <p className="text-sm text-muted-foreground">This list is currently empty.</p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex justify-end">
              <MtgCardViewToggle view={viewMode} onViewChange={setViewMode} />
            </div>
            <VirtualizedMtgCardGrid
              view={viewMode}
              scrollElementRef={scrollContainerRef}
              cards={cards.map((card) => ({
                id: card.id,
                scryfallCard: {
                  name: card.scryfallCard.name,
                  setCode: card.scryfallCard.setCode,
                  setName: card.scryfallCard.setName,
                  collectorNumber: card.scryfallCard.collectorNumber,
                  imageUri: card.scryfallCard.imageUri,
                  manaCost: card.scryfallCard.manaCost,
                },
                condition: card.condition,
                isFoil: card.isFoil,
                language: card.language,
                quantity: card.quantity,
              }))}
            />
          </>
        )}
      </PageContent>
    </PageLayout>
  );
}

function getListTypeIcon(listType: string, sourceType: string | null) {
  if (listType === "wishlist") {
    return Heart;
  }
  switch (sourceType) {
    case "gift":
      return Gift;
    case "purchase":
      return ShoppingCart;
    case "trade":
      return Sparkles;
    default:
      return ListChecks;
  }
}

function getSourceTypeLabel(sourceType: string | null): string {
  switch (sourceType) {
    case "gift":
      return "Gift";
    case "purchase":
      return "Purchase";
    case "trade":
      return "Trade";
    case "other":
      return "Other";
    default:
      return "Owned Cards";
  }
}

export function PublicListSkeleton() {
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
        <div className="mb-6 flex gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-24" />
        </div>
        <MtgCardGridSkeleton count={10} />
      </PageContent>
    </PageLayout>
  );
}
