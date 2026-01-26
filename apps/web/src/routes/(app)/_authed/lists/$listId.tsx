import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Gift,
  Heart,
  ListChecks,
  MoreHorizontal,
  Plus,
  Search,
  ShoppingCart,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CardImportDialog } from "@/components/card-import-dialog";
import type { CardImportData } from "@/components/card-import-dialog";
import { DeleteListDialog } from "@/components/delete-list-dialog";
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
  const navigate = useNavigate();
  const { data: list } = useSuspenseQuery(orpc.lists.get.queryOptions({ input: { id: listId } }));
  const { data: cards } = useSuspenseQuery(orpc.lists.getCards.queryOptions({ input: { listId } }));
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const importMutation = useMutation({
    ...orpc.lists.importCards.mutationOptions(),
    onSuccess: (data) => {
      toast.success(data.message);
      setIsImportOpen(false);
      queryClient.invalidateQueries({
        queryKey: orpc.lists.get.queryOptions({ input: { id: listId } }).queryKey,
      });
      queryClient.invalidateQueries({
        queryKey: orpc.lists.getCards.queryOptions({ input: { listId } }).queryKey,
      });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to import cards");
    },
  });

  const deleteMutation = useMutation({
    ...orpc.lists.delete.mutationOptions(),
    onSuccess: (data) => {
      toast.success(`Deleted "${data.deletedListName}"`);
      queryClient.invalidateQueries({
        queryKey: orpc.lists.list.queryOptions().queryKey,
      });
      navigate({ to: "/lists" });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete list");
    },
  });

  const handleImport = (data: CardImportData) => {
    importMutation.mutate({
      listId,
      csvContent: data.csvContent,
      format: data.format,
    });
  };

  const handleDelete = () => {
    deleteMutation.mutate({ id: listId });
  };

  const TypeIcon = getListTypeIcon(list.listType, list.sourceType);
  const isWishlist = list.listType === "wishlist";

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
        title={`Import Cards to "${list.name}"`}
        description="Import cards from a CSV file or paste CSV content directly."
      />

      <DeleteListDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        listName={list.name}
        onConfirm={handleDelete}
        isDeleting={deleteMutation.isPending}
      />

      <PageContent>
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
          <EmptyCardsState
            variant="list"
            onImportClick={() => setIsImportOpen(true)}
            onAddClick={() => {
              // TODO: Open search dialog
            }}
          />
        ) : (
          <MtgCardGrid>
            {cards.map((card) => (
              <MtgCardItem key={card.id} card={card} />
            ))}
          </MtgCardGrid>
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
        <MtgCardGridSkeleton count={10} />
      </PageContent>
    </PageLayout>
  );
}
