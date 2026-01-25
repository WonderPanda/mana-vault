import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Gift, ListChecks, Plus, Search, ShoppingCart, Sparkles, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CardImportDialog } from "@/components/card-import-dialog";
import type { CardImportData } from "@/components/card-import-dialog";
import { PageContent, PageHeader, PageLayout, PageTitle } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/(app)/_authed/lists/$listId")({
  component: ListDetailPage,
  beforeLoad: async ({ context: { queryClient }, params }) => {
    await Promise.all([
      queryClient.ensureQueryData(orpc.lists.get.queryOptions({ input: { id: params.listId } })),
      queryClient.ensureQueryData(
        orpc.lists.getCards.queryOptions({ input: { listId: params.listId } }),
      ),
    ]);
  },
});

function ListDetailPage() {
  const { listId } = Route.useParams();
  const { data: list } = useSuspenseQuery(orpc.lists.get.queryOptions({ input: { id: listId } }));
  const { data: cards } = useSuspenseQuery(
    orpc.lists.getCards.queryOptions({ input: { listId } }),
  );
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);

  const importMutation = useMutation({
    ...orpc.lists.importCards.mutationOptions(),
    onSuccess: (data) => {
      toast.success(data.message);
      setIsImportOpen(false);
      // Invalidate queries to refetch the updated data
      import("@/utils/orpc").then(({ queryClient }) => {
        queryClient.invalidateQueries({
          queryKey: orpc.lists.get.queryOptions({ input: { id: listId } }).queryKey,
        });
        queryClient.invalidateQueries({
          queryKey: orpc.lists.getCards.queryOptions({ input: { listId } }).queryKey,
        });
      });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to import cards");
    },
  });

  const handleImport = (data: CardImportData) => {
    importMutation.mutate({
      listId,
      csvContent: data.csvContent,
      format: data.format,
    });
  };

  const TypeIcon = getSourceTypeIcon(list.sourceType);

  return (
    <PageLayout>
      <PageHeader>
        <div className="flex items-center gap-3">
          <Link to="/lists">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
              <TypeIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <PageTitle>{list.name}</PageTitle>
              {list.description && (
                <p className="text-sm text-muted-foreground">{list.description}</p>
              )}
            </div>
          </div>
        </div>
        <Popover open={isAddMenuOpen} onOpenChange={setIsAddMenuOpen}>
          <PopoverTrigger
            render={
              <Button size="icon" className="rounded-full">
                <Plus className="h-5 w-5" />
              </Button>
            }
          />
          <PopoverContent align="end" className="w-48 p-1">
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                setIsAddMenuOpen(false);
                // TODO: Open search dialog
              }}
            >
              <Search className="mr-2 h-4 w-4" />
              Search Cards
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => {
                setIsAddMenuOpen(false);
                setIsImportOpen(true);
              }}
            >
              <Upload className="mr-2 h-4 w-4" />
              Import CSV
            </Button>
          </PopoverContent>
        </Popover>
      </PageHeader>

      <CardImportDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onImport={handleImport}
        isImporting={importMutation.isPending}
        title={`Import Cards to "${list.name}"`}
        description="Import cards from a CSV file or paste CSV content directly."
      />

      <PageContent>
        {/* List metadata */}
        <div className="mb-6 flex flex-wrap gap-4 text-sm text-muted-foreground">
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
          <EmptyCardsState onImportClick={() => setIsImportOpen(true)} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {cards.map((card) => (
              <ListCardItem key={card.id} card={card} />
            ))}
          </div>
        )}
      </PageContent>
    </PageLayout>
  );
}

function getSourceTypeIcon(sourceType: string | null) {
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
      return "Custom List";
  }
}

type ListCard = Awaited<
  ReturnType<ReturnType<typeof orpc.lists.getCards.queryOptions>["queryFn"]>
>[number];

function ListCardItem({ card }: { card: ListCard }) {
  const { scryfallCard, collectionCard } = card;

  return (
    <Card className="overflow-hidden">
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
      <CardContent className="p-3">
        <h4 className="truncate font-medium">{scryfallCard.name}</h4>
        <p className="truncate text-xs text-muted-foreground">
          {scryfallCard.setName} ({scryfallCard.setCode.toUpperCase()}) #{scryfallCard.collectorNumber}
        </p>
        <div className="mt-1 flex flex-wrap gap-1">
          {collectionCard.isFoil && (
            <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
              Foil
            </span>
          )}
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
            {collectionCard.condition}
          </span>
          {collectionCard.language !== "en" && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase">
              {collectionCard.language}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyCardsState({ onImportClick }: { onImportClick: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <ListChecks className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="mb-2 text-lg font-semibold">No cards yet</h3>
      <p className="mb-6 max-w-sm text-muted-foreground">
        This list is empty. Add cards from your collection or import them from a CSV file.
      </p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onImportClick}>
          <Upload className="mr-2 h-4 w-4" />
          Import CSV
        </Button>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Cards
        </Button>
      </div>
    </div>
  );
}

export function ListDetailSkeleton() {
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
