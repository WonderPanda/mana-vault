import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  Check,
  Gift,
  Heart,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Share2,
  ShoppingCart,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { CardImportDialog } from "@/components/card-import-dialog";
import type { CardDetailAction } from "@/components/card-detail-dialog";
import { CommanderDisplay } from "@/components/commander-display";
import { CommanderSearchDialog } from "@/components/commander-search-dialog";
import type { CardImportData } from "@/components/card-import-dialog";
import { CardSearchDialog } from "@/components/card-search";
import { DeleteListDialog } from "@/components/delete-list-dialog";
import { buildCommanderSearchPrefix } from "@/lib/commander-utils";
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
import { Input } from "@/components/ui/input";
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
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isCommanderSearchOpen, setIsCommanderSearchOpen] = useState(false);
  const [viewMode, setViewMode] = useState<MtgCardViewMode>("grid");
  const [copySuccess, setCopySuccess] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [editName, setEditName] = useState(list.name);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const commanderSearchPrefix = list.commander
    ? buildCommanderSearchPrefix([list.commander.colorIdentity])
    : undefined;

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  const handleRename = () => {
    const trimmed = editName.trim();
    if (!trimmed || trimmed === list.name) {
      setEditName(list.name);
      setIsRenaming(false);
      return;
    }
    updateMutation.mutate(
      { id: listId, name: trimmed },
      {
        onSuccess: () => {
          setIsRenaming(false);
        },
        onError: () => {
          setEditName(list.name);
          setIsRenaming(false);
        },
      },
    );
  };

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

  const removeCardMutation = useMutation({
    ...orpc.lists.removeCard.mutationOptions(),
    onSuccess: () => {
      toast.success("Card removed from list");
      queryClient.invalidateQueries({
        queryKey: orpc.lists.get.queryOptions({ input: { id: listId } }).queryKey,
      });
      queryClient.invalidateQueries({
        queryKey: orpc.lists.getCards.queryOptions({ input: { listId } }).queryKey,
      });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to remove card");
    },
  });

  const cardActions: CardDetailAction[] = useMemo(
    () => [
      {
        icon: <X className="h-5 w-5" />,
        label: "Remove from list",
        variant: "destructive" as const,
        onClick: (card) => {
          removeCardMutation.mutate({
            listId,
            virtualListCardId: card.id,
          });
        },
      },
    ],
    [listId, removeCardMutation],
  );

  const addCardsMutation = useMutation({
    ...orpc.lists.addCardsFromSearch.mutationOptions(),
    onSuccess: (data) => {
      toast.success(data.message);
      queryClient.invalidateQueries({
        queryKey: orpc.lists.get.queryOptions({ input: { id: listId } }).queryKey,
      });
      queryClient.invalidateQueries({
        queryKey: orpc.lists.getCards.queryOptions({ input: { listId } }).queryKey,
      });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to add cards");
    },
  });

  const updateMutation = useMutation({
    ...orpc.lists.update.mutationOptions(),
    onSuccess: () => {
      toast.success("List updated");
      queryClient.invalidateQueries({
        queryKey: orpc.lists.get.queryOptions({ input: { id: listId } }).queryKey,
      });
      queryClient.invalidateQueries({
        queryKey: orpc.lists.list.queryOptions().queryKey,
      });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update list");
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

  const handleAddFromSearch = (cards: SelectedCard[]) => {
    addCardsMutation.mutate({
      listId,
      cards: cards.map((c) => ({
        scryfallId: c.card.id,
        quantity: c.quantity,
      })),
    });
  };

  const handleTogglePublic = (isPublic: boolean) => {
    updateMutation.mutate({
      id: listId,
      isPublic,
    });
  };

  const handleCopyLink = async () => {
    if (!list.slug) return;

    const publicUrl = `${window.location.origin}/${list.userId}/list/${list.slug}`;
    await navigator.clipboard.writeText(publicUrl);
    setCopySuccess(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopySuccess(false), 2000);
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
              {isRenaming ? (
                <Input
                  ref={renameInputRef}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={handleRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.currentTarget.blur();
                    }
                    if (e.key === "Escape") {
                      setEditName(list.name);
                      setIsRenaming(false);
                    }
                  }}
                  className="h-9 text-2xl font-bold text-primary"
                  maxLength={100}
                />
              ) : (
                <PageTitle
                  className="cursor-pointer"
                  onClick={() => {
                    setEditName(list.name);
                    setIsRenaming(true);
                  }}
                >
                  {list.name}
                </PageTitle>
              )}
              {list.description && (
                <p className="text-sm text-muted-foreground">{list.description}</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {list.isPublic && list.slug && (
            <Button variant="outline" onClick={handleCopyLink} className="gap-2">
              {copySuccess ? (
                <>
                  <Check className="h-4 w-4 text-green-500" />
                  Copied!
                </>
              ) : (
                <>
                  <Share2 className="h-4 w-4" />
                  Share
                </>
              )}
            </Button>
          )}
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
            <DropdownMenuContent align="end" className="min-w-[160px]">
              <DropdownMenuItem
                onClick={() => {
                  setEditName(list.name);
                  setIsRenaming(true);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={updateMutation.isPending}
                onClick={() => handleTogglePublic(!list.isPublic)}
              >
                <Share2 className="mr-2 h-4 w-4" />
                {list.isPublic ? "Make Private" : "Make Public"}
              </DropdownMenuItem>
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
      />

      <DeleteListDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        listName={list.name}
        onConfirm={handleDelete}
        isDeleting={deleteMutation.isPending}
      />

      <CardSearchDialog
        open={isSearchOpen}
        onOpenChange={setIsSearchOpen}
        onSelect={handleAddFromSearch}
        title={`Add Cards to "${list.name}"`}
        description={
          commanderSearchPrefix
            ? "Search results are filtered to cards legal in Commander within your commander's color identity."
            : "Search for Magic cards to add to this list. You can select multiple cards and specify quantities."
        }
        searchPrefix={commanderSearchPrefix}
      />

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

        <CommanderDisplay
          commander={list.commander}
          onSet={() => setIsCommanderSearchOpen(true)}
          onChange={() => setIsCommanderSearchOpen(true)}
          onRemove={() => updateMutation.mutate({ id: listId, commanderScryfallCardId: null })}
          disabled={updateMutation.isPending}
        />

        <CommanderSearchDialog
          open={isCommanderSearchOpen}
          onOpenChange={setIsCommanderSearchOpen}
          onSelect={(card) =>
            updateMutation.mutate({ id: listId, commanderScryfallCardId: card.id })
          }
        />

        {/* Cards section */}
        {cards.length === 0 ? (
          <EmptyCardsState
            variant="list"
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
              cardActions={cardActions}
              cards={cards
                .map((card) => ({
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
                  quantity: card.quantity,
                  isInCollection: card.isInCollection,
                }))
                .sort((a, b) => {
                  const priceA = a.isFoil ? a.scryfallCard.priceUsdFoil : a.scryfallCard.priceUsd;
                  const priceB = b.isFoil ? b.scryfallCard.priceUsdFoil : b.scryfallCard.priceUsd;
                  return (priceB ?? 0) - (priceA ?? 0);
                })}
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
