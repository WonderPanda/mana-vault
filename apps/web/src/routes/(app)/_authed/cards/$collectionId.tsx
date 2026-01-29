import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookOpen,
  Box,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { CardImportDialog } from "@/components/card-import-dialog";
import type { CardImportData } from "@/components/card-import-dialog";
import { CardSearchDialog } from "@/components/card-search";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import type { SelectedCard } from "@/types/scryfall";
import { EmptyCardsState } from "@/components/empty-cards-state";
import {
  MtgCardGridSkeleton,
  MtgCardViewToggle,
  VirtualizedMtgCardGrid,
  type MtgCardViewMode,
} from "@/components/mtg-card-grid";
import { PageContent, PageHeader, PageLayout, PageTitle } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useCollectionCardsByContainer, useStorageContainer } from "@/hooks/use-collection-cards";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/(app)/_authed/cards/$collectionId")({
  component: CollectionDetailPage,
});

function CollectionDetailPage() {
  const { collectionId } = Route.useParams();
  const navigate = useNavigate();

  const { data: collection } = useStorageContainer(collectionId);
  const { data: cards = [] } = useCollectionCardsByContainer(collectionId);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [viewMode, setViewMode] = useState<MtgCardViewMode>("grid");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const importMutation = useMutation({
    ...orpc.collections.importCards.mutationOptions(),
    onSuccess: (data) => {
      toast.success(data.message);
      setIsImportOpen(false);
      // Cards will appear via RxDB sync
    },
    onError: (error) => {
      toast.error(error.message || "Failed to import cards");
    },
  });

  const deleteMutation = useMutation({
    ...orpc.collections.delete.mutationOptions(),
    onSuccess: (data) => {
      toast.success(`Deleted "${data.deletedCollectionName}"`);
      queryClient.invalidateQueries({
        queryKey: orpc.collections.list.queryOptions().queryKey,
      });
      navigate({ to: "/cards" });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete collection");
    },
  });

  const handleImport = (data: CardImportData) => {
    importMutation.mutate({
      collectionId,
      csvContent: data.csvContent,
      format: data.format,
    });
  };

  const handleDelete = () => {
    deleteMutation.mutate({ id: collectionId });
  };

  const addCardsMutation = useMutation({
    ...orpc.collections.addCardsFromSearch.mutationOptions(),
    onSuccess: (data) => {
      toast.success(data.message);
      setIsSearchOpen(false);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to add cards");
    },
  });

  const handleAddFromSearch = (cards: SelectedCard[]) => {
    addCardsMutation.mutate({
      collectionId,
      cards: cards.map((c) => ({
        scryfallId: c.card.id,
        quantity: c.quantity,
      })),
    });
  };

  if (!collection) {
    return <CollectionDetailSkeleton />;
  }

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
        <div className="flex items-center gap-2">
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
                  setIsSearchOpen(true);
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
                Import
              </Button>
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setIsDeleteOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </PageHeader>

      <CardImportDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onImport={handleImport}
        isImporting={importMutation.isPending}
        title={`Import Cards to "${collection.name}"`}
      />

      <DeleteConfirmationDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        itemName={collection.name}
        itemType="Collection"
        onConfirm={handleDelete}
        isDeleting={deleteMutation.isPending}
        warningMessage="This will permanently delete the collection. Cards in this collection will become unassigned but will NOT be deleted from your collection."
      />

      <CardSearchDialog
        open={isSearchOpen}
        onOpenChange={setIsSearchOpen}
        onSelect={handleAddFromSearch}
        title={`Add Cards to "${collection.name}"`}
        description="Search for Magic cards to add to this collection. You can select multiple cards and specify quantities."
      />

      <PageContent ref={scrollContainerRef}>
        {cards.length === 0 ? (
          <EmptyCardsState
            variant="collection"
            onImportClick={() => setIsImportOpen(true)}
            onAddClick={() => setIsSearchOpen(true)}
          />
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
                  priceUsd: card.scryfallCard.priceUsd,
                  priceUsdFoil: card.scryfallCard.priceUsdFoil,
                },
                condition: card.condition,
                isFoil: card.isFoil,
                language: card.language,
                isInCollection: true,
              }))}
            />
          </>
        )}
      </PageContent>
    </PageLayout>
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
        <MtgCardGridSkeleton count={10} />
      </PageContent>
    </PageLayout>
  );
}
