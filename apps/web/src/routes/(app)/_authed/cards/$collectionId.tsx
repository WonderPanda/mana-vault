import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
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
import { useState } from "react";
import { toast } from "sonner";

import { CardImportDialog } from "@/components/card-import-dialog";
import type { CardImportData } from "@/components/card-import-dialog";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { EmptyCardsState } from "@/components/empty-cards-state";
import { MtgCardGrid, MtgCardGridSkeleton, MtgCardItem } from "@/components/mtg-card-grid";
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
import { orpc, queryClient } from "@/utils/orpc";

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
  const navigate = useNavigate();
  const { data: collection } = useSuspenseQuery(
    orpc.collections.get.queryOptions({ input: { id: collectionId } }),
  );
  const { data: cards } = useSuspenseQuery(
    orpc.collections.getCards.queryOptions({ input: { collectionId } }),
  );
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const importMutation = useMutation({
    ...orpc.collections.importCards.mutationOptions(),
    onSuccess: (data) => {
      toast.success(data.message);
      setIsImportOpen(false);
      queryClient.invalidateQueries({
        queryKey: orpc.collections.get.queryOptions({ input: { id: collectionId } }).queryKey,
      });
      queryClient.invalidateQueries({
        queryKey: orpc.collections.getCards.queryOptions({ input: { collectionId } }).queryKey,
      });
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
        description="Import cards from a CSV file. Cards will be added directly to your collection."
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

      <PageContent>
        {cards.length === 0 ? (
          <EmptyCardsState
            variant="collection"
            onImportClick={() => setIsImportOpen(true)}
            onAddClick={() => {
              // TODO: Open search dialog
            }}
          />
        ) : (
          <MtgCardGrid>
            {cards.map((card) => {
              if (!card.card) return null;
              return (
                <MtgCardItem
                  key={card.id}
                  card={{
                    id: card.id,
                    scryfallCard: {
                      name: card.card.name,
                      setCode: card.card.setCode,
                      setName: card.card.setName,
                      collectorNumber: card.card.collectorNumber,
                      imageUri: card.card.imageUri,
                    },
                    condition: card.condition,
                    isFoil: card.isFoil,
                    language: card.language,
                    isInCollection: true,
                  }}
                />
              );
            })}
          </MtgCardGrid>
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
