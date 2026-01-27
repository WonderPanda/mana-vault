import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, MoreHorizontal, Plus, Search, Swords, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { CardImportDialog } from "@/components/card-import-dialog";
import type { CardImportData } from "@/components/card-import-dialog";
import { CardSearchDialog } from "@/components/card-search";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import type { SelectedCard } from "@/types/scryfall";
import { EmptyCardsState } from "@/components/empty-cards-state";
import {
  MtgCardGrid,
  MtgCardGridSkeleton,
  MtgCardItem,
  MtgCardViewToggle,
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
import {
  CARD_CATEGORIES,
  useDeck,
  useDeckCardCount,
  useDeckCards,
  useDeckCardsByCategory,
  useDeckCommanders,
  type CardCategory,
} from "@/hooks/use-deck-cards-by-category";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/(app)/_authed/decks/$deckId")({
  component: DeckDetailPage,
});

function DeckDetailPage() {
  const { deckId } = Route.useParams();
  const navigate = useNavigate();
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [viewMode, setViewMode] = useState<MtgCardViewMode>("grid");

  const { data: deck } = useDeck(deckId);
  const { data: cardCount } = useDeckCardCount(deckId);
  const { data: allCards } = useDeckCards(deckId);
  const { data: commanders } = useDeckCommanders(deckId);
  const isCommanderDeck = deck?.format === "commander";

  const importMutation = useMutation({
    ...orpc.decks.importCards.mutationOptions(),
    onSuccess: (data) => {
      toast.success(data.message);
      setIsImportOpen(false);
      // TODO: Remove
      // queryClient.invalidateQueries({
      //   queryKey: orpc.decks.get.queryOptions({ input: { id: deckId } }).queryKey,
      // });
      // queryClient.invalidateQueries({
      //   queryKey: orpc.decks.getCards.queryOptions({ input: { deckId } }).queryKey,
      // });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to import cards");
    },
  });

  const deleteMutation = useMutation({
    ...orpc.decks.delete.mutationOptions(),
    onSuccess: (data) => {
      toast.success(`Deleted "${data.deletedDeckName}"`);
      queryClient.invalidateQueries({
        queryKey: orpc.decks.list.queryOptions().queryKey,
      });
      navigate({ to: "/decks" });
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete deck");
    },
  });

  const addCardsMutation = useMutation({
    ...orpc.decks.addCardsFromSearch.mutationOptions(),
    onSuccess: (data) => {
      toast.success(data.message);
      setIsSearchOpen(false);
      // RxDB sync handles the UI update via deckCardPublisher RESYNC event
    },
    onError: (error) => {
      toast.error(error.message || "Failed to add cards");
    },
  });

  const handleImport = (data: CardImportData) => {
    importMutation.mutate({
      deckId,
      csvContent: data.csvContent,
      format: data.format,
    });
  };

  const handleDelete = () => {
    deleteMutation.mutate({ id: deckId });
  };

  const handleAddFromSearch = (cards: SelectedCard[]) => {
    addCardsMutation.mutate({
      deckId,
      cards: cards.map((c) => ({
        scryfallId: c.card.id,
        quantity: c.quantity,
      })),
    });
  };

  if (!deck) {
    return <DeckDetailSkeleton />;
  }

  return (
    <PageLayout>
      <PageHeader>
        <div className="flex items-center gap-3">
          <Link to="/decks">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/20">
              <Swords className="h-5 w-5 text-primary" />
            </div>
            <div>
              <PageTitle>{deck.name}</PageTitle>
              <div className="flex items-center gap-2">
                <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium uppercase">
                  {deck.format}
                </span>
                <span className="text-sm text-muted-foreground">{getStatusLabel(deck.status)}</span>
              </div>
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
        title={`Import Cards to "${deck.name}"`}
      />

      <DeleteConfirmationDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        itemName={deck.name}
        itemType="Deck"
        onConfirm={handleDelete}
        isDeleting={deleteMutation.isPending}
        warningMessage="This will permanently delete the deck and all cards in it. Your collection cards will not be affected."
      />

      <CardSearchDialog
        open={isSearchOpen}
        onOpenChange={setIsSearchOpen}
        onSelect={handleAddFromSearch}
        title={`Add Cards to "${deck.name}"`}
        description="Search for Magic cards to add to this deck. You can select multiple cards and specify quantities."
      />

      <PageContent>
        {/* Deck metadata */}
        <div className="mb-6 flex flex-wrap gap-4 text-sm text-muted-foreground">
          <div>
            <span className="font-medium">Format:</span> {getFormatLabel(deck.format)}
          </div>
          <div>
            <span className="font-medium">Status:</span> {getStatusLabel(deck.status)}
          </div>
          {deck.archetype && (
            <div>
              <span className="font-medium">Archetype:</span> {getArchetypeLabel(deck.archetype)}
            </div>
          )}
          <div>
            <span className="font-medium">Cards:</span> {cardCount}
          </div>
          <div>
            <span className="font-medium">Created:</span>{" "}
            {new Date(deck.createdAt).toLocaleDateString()}
          </div>
        </div>

        {deck.description && (
          <div className="mb-6 rounded-lg bg-muted/50 p-4">
            <p className="text-sm whitespace-pre-wrap">{deck.description}</p>
          </div>
        )}

        {/* Cards section */}
        {allCards?.length === 0 ? (
          <EmptyCardsState
            title="No cards in this deck"
            description="Start building your deck by importing cards or searching for cards to add."
            onImportClick={() => setIsImportOpen(true)}
            onAddClick={() => setIsSearchOpen(true)}
          />
        ) : (
          <>
            <div className="mb-4 flex justify-end">
              <MtgCardViewToggle view={viewMode} onViewChange={setViewMode} />
            </div>
            <div className="space-y-6">
              {/* Commander section - shown prominently for commander decks */}
              {isCommanderDeck && commanders && commanders.length > 0 && (
                <div>
                  <h3 className="mb-2 text-lg font-semibold text-primary">
                    Commander{commanders.length > 1 ? "s" : ""} ({commanders.length})
                  </h3>
                  <MtgCardGrid view={viewMode}>
                    {commanders.map((card) => (
                      <MtgCardItem key={card.id} card={card} view={viewMode} />
                    ))}
                  </MtgCardGrid>
                </div>
              )}
              {CARD_CATEGORIES.map((category) => (
                <DeckCardCategory
                  key={category}
                  deckId={deckId}
                  category={category}
                  view={viewMode}
                  excludeCommanders={isCommanderDeck}
                />
              ))}
            </div>
          </>
        )}
      </PageContent>
    </PageLayout>
  );
}

interface DeckCardCategoryProps {
  deckId: string;
  category: CardCategory;
  view: MtgCardViewMode;
  excludeCommanders?: boolean;
}

function DeckCardCategory({ deckId, category, view, excludeCommanders }: DeckCardCategoryProps) {
  const { data: cards } = useDeckCardsByCategory(deckId, category);

  // Filter out commanders if they're displayed separately
  const filteredCards = excludeCommanders ? cards?.filter((card) => !card.isCommander) : cards;

  if (!filteredCards || filteredCards.length === 0) return null;

  const categoryCount = filteredCards.reduce((total, card) => total + (card.quantity ?? 1), 0);

  return (
    <div>
      <h3 className="mb-2 text-lg font-semibold text-muted-foreground">
        {category} ({categoryCount})
      </h3>
      <MtgCardGrid view={view}>
        {filteredCards.map((card) => (
          <MtgCardItem key={card.id} card={card} view={view} />
        ))}
      </MtgCardGrid>
    </div>
  );
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "active":
      return "Active";
    case "retired":
      return "Retired";
    case "in_progress":
      return "In Progress";
    case "theorycraft":
      return "Theorycraft";
    default:
      return status;
  }
}

function getFormatLabel(format: string): string {
  switch (format) {
    case "commander":
      return "Commander";
    case "standard":
      return "Standard";
    case "modern":
      return "Modern";
    case "legacy":
      return "Legacy";
    case "pioneer":
      return "Pioneer";
    case "pauper":
      return "Pauper";
    case "other":
      return "Other";
    default:
      return format;
  }
}

function getArchetypeLabel(archetype: string): string {
  switch (archetype) {
    case "aggro":
      return "Aggro";
    case "control":
      return "Control";
    case "combo":
      return "Combo";
    case "midrange":
      return "Midrange";
    case "tempo":
      return "Tempo";
    case "other":
      return "Other";
    default:
      return archetype;
  }
}

export function DeckDetailSkeleton() {
  return (
    <PageLayout>
      <PageHeader>
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-32" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-16 rounded" />
              <Skeleton className="h-4 w-20" />
            </div>
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
