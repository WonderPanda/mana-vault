import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, MoreHorizontal, Plus, Swords, Trash2, Upload, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { CardDetailDialog, type CardDetailAction } from "@/components/card-detail-dialog";
import type { MtgCardData } from "@/components/mtg-card-grid";
import { CardImportDialog } from "@/components/card-import-dialog";
import type { CardImportData } from "@/components/card-import-dialog";
import { CardSearchDialog } from "@/components/card-search";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { getCardImageUri, type SelectedCard } from "@/types/scryfall";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BOARD_TYPES,
  CARD_CATEGORIES,
  useDeck,
  useDeckCardCount,
  useDeckCardCountByBoard,
  useDeckCards,
  useDeckCardsByCategory,
  useDeckCommanders,
  useDeckOwnedCardCountByBoard,
  type BoardType,
  type CardCategory,
} from "@/hooks/use-deck-cards";
import { buildCommanderSearchPrefix } from "@/lib/commander-utils";
import { useDbCollections } from "@/lib/db/db-context";
import { client, orpc, queryClient } from "@/utils/orpc";

const deckDetailSearchSchema = z.object({
  board: z.enum(["main", "sideboard", "maybeboard"]).optional().catch("main"),
});

export const Route = createFileRoute("/(app)/_authed/decks/$deckId")({
  component: DeckDetailPage,
  validateSearch: deckDetailSearchSchema,
});

function DeckDetailPage() {
  const { deckId } = Route.useParams();
  const navigate = useNavigate();
  const { board } = Route.useSearch();
  const activeBoard = (board as BoardType) ?? BOARD_TYPES.MAIN;
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [viewMode, setViewMode] = useState<MtgCardViewMode>("grid");
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null);

  const { data: deck } = useDeck(deckId);
  const { data: cardCount } = useDeckCardCount(deckId);
  const { data: allCards } = useDeckCards(deckId, activeBoard);
  const { data: commanders } = useDeckCommanders(deckId);
  const isCommanderDeck = deck?.format === "commander";

  const commanderSearchPrefix =
    isCommanderDeck && commanders && commanders.length > 0
      ? buildCommanderSearchPrefix(commanders.map((c) => c.scryfallCard?.colorIdentity))
      : undefined;

  const { data: mainCount } = useDeckCardCountByBoard(deckId, BOARD_TYPES.MAIN);
  const { data: sideboardCount } = useDeckCardCountByBoard(deckId, BOARD_TYPES.SIDEBOARD);
  const { data: consideringCount } = useDeckCardCountByBoard(deckId, BOARD_TYPES.CONSIDERING);

  const { data: mainOwned } = useDeckOwnedCardCountByBoard(deckId, BOARD_TYPES.MAIN);
  const { data: sideboardOwned } = useDeckOwnedCardCountByBoard(deckId, BOARD_TYPES.SIDEBOARD);
  const { data: consideringOwned } = useDeckOwnedCardCountByBoard(deckId, BOARD_TYPES.CONSIDERING);

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

  const handleImport = (data: CardImportData) => {
    importMutation.mutate({
      deckId,
      csvContent: data.csvContent,
      format: data.format,
      board: activeBoard,
      addToCollection: data.addToCollection ?? false,
    });
  };

  const handleDelete = () => {
    deleteMutation.mutate({ id: deckId });
  };

  const { deckCardCollection, scryfallCardCollection } = useDbCollections();

  const handleAddFromSearch = (cards: SelectedCard[], options?: { addToCollection?: boolean }) => {
    const addToCollection = options?.addToCollection ?? false;
    const cardsWithIds = cards.map((c) => ({ id: crypto.randomUUID(), card: c }));
    const now = Date.now();

    // Optimistic insert — appears instantly via TanStack DB → RxDB push replication
    for (const { id, card } of cardsWithIds) {
      // Ensure scryfall card is in the local collection so live query joins work.
      // Ignore DuplicateKeyError if it already exists from a previous add/sync.
      try {
        scryfallCardCollection.insert({
          id: card.card.id,
          oracleId: card.card.oracle_id,
          name: card.card.name,
          setCode: card.card.set,
          setName: card.card.set_name,
          collectorNumber: card.card.collector_number,
          rarity: card.card.rarity,
          manaCost: card.card.mana_cost ?? null,
          cmc: card.card.cmc ?? null,
          typeLine: card.card.type_line ?? null,
          oracleText: card.card.oracle_text ?? null,
          colors: card.card.colors ? JSON.stringify(card.card.colors) : null,
          colorIdentity: card.card.color_identity ? JSON.stringify(card.card.color_identity) : null,
          imageUri: getCardImageUri(card.card) ?? null,
          scryfallUri: card.card.scryfall_uri,
          priceUsd: null,
          priceUsdFoil: null,
          priceUsdEtched: null,
          dataJson: null,
          createdAt: now,
          updatedAt: now,
          _deleted: false,
        });
      } catch {
        // Already exists — that's fine
      }

      deckCardCollection.insert({
        id,
        deckId,
        oracleId: card.card.oracle_id,
        preferredScryfallId: card.card.id,
        quantity: card.quantity,
        board: activeBoard,
        isCommander: false,
        isCompanion: false,
        collectionCardId: null,
        isProxy: false,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
        _deleted: false,
      });
    }

    const totalQuantity = cards.reduce((sum, c) => sum + c.quantity, 0);
    toast.success(`Added ${totalQuantity} card${totalQuantity !== 1 ? "s" : ""} to the deck.`);

    // If addToCollection, call server to create collection cards
    if (addToCollection) {
      client.decks.addCardsFromSearch({
        deckId,
        cards: cardsWithIds.map(({ id, card }) => ({
          id,
          scryfallId: card.card.id,
          quantity: card.quantity,
        })),
        board: activeBoard,
        addToCollection: true,
      });
    }
  };

  const handleRemoveCard = useCallback(
    (card: MtgCardData) => {
      const tx = deckCardCollection.delete(card.id);
      tx.isPersisted.promise.then(
        () => toast.success("Card removed from deck"),
        (error: Error) => toast.error(error.message || "Failed to remove card"),
      );
    },
    [deckCardCollection],
  );

  const cardActions: CardDetailAction[] = useMemo(
    () => [
      {
        icon: <X className="h-5 w-5" />,
        label: "Remove from deck",
        variant: "destructive" as const,
        onClick: handleRemoveCard,
      },
    ],
    [handleRemoveCard],
  );

  const handleCardClick = (card: { id: string }) => {
    if (!allCards) return;
    const index = allCards.findIndex((c) => c.id === card.id);
    if (index !== -1) setSelectedCardIndex(index);
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
          <Button size="icon" className="rounded-full" onClick={() => setIsSearchOpen(true)}>
            <Plus className="h-5 w-5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsImportOpen(true)}>
                <Upload className="mr-2 h-4 w-4" />
                Import from CSV
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
        title={`Import Cards to "${deck.name}"`}
        showCollectionToggle
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
        description={
          commanderSearchPrefix
            ? "Search results are filtered to cards legal in Commander within your commander's color identity."
            : "Search for Magic cards to add to this deck. You can select multiple cards and specify quantities."
        }
        showCollectionToggle
        searchPrefix={commanderSearchPrefix}
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

        {/* Board tabs */}
        <div className="mb-6">
          <Tabs
            value={activeBoard}
            onValueChange={(v) =>
              navigate({
                to: ".",
                search: (prev) => ({ ...prev, board: v as BoardType }),
              })
            }
          >
            <TabsList>
              <TabsTrigger value={BOARD_TYPES.MAIN}>
                Main Deck ({mainOwned?.owned ?? 0}/{mainCount ?? 0})
              </TabsTrigger>
              <TabsTrigger value={BOARD_TYPES.SIDEBOARD}>
                Sideboard ({sideboardOwned?.owned ?? 0}/{sideboardCount ?? 0})
              </TabsTrigger>
              <TabsTrigger value={BOARD_TYPES.CONSIDERING}>
                Considering ({consideringOwned?.owned ?? 0}/{consideringCount ?? 0})
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

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
              {/* Commander section - shown prominently for commander decks on Main Deck tab */}
              {isCommanderDeck &&
                activeBoard === BOARD_TYPES.MAIN &&
                commanders &&
                commanders.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-lg font-semibold text-primary">
                      Commander{commanders.length > 1 ? "s" : ""} ({commanders.length})
                    </h3>
                    <MtgCardGrid view={viewMode}>
                      {commanders.map((card) => (
                        <MtgCardItem
                          key={card.id}
                          card={card}
                          view={viewMode}
                          onClick={() => handleCardClick(card)}
                        />
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
                  excludeCommanders={isCommanderDeck && activeBoard === BOARD_TYPES.MAIN}
                  activeBoard={activeBoard}
                  onCardClick={handleCardClick}
                />
              ))}
            </div>
          </>
        )}

        {allCards && allCards.length > 0 && (
          <CardDetailDialog
            cards={allCards}
            selectedIndex={selectedCardIndex}
            onClose={() => setSelectedCardIndex(null)}
            actions={cardActions}
          />
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
  activeBoard: BoardType;
  onCardClick?: (card: { id: string }) => void;
}

function DeckCardCategory({
  deckId,
  category,
  view,
  excludeCommanders,
  activeBoard,
  onCardClick,
}: DeckCardCategoryProps) {
  const { data: cards } = useDeckCardsByCategory(deckId, category, activeBoard);

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
          <MtgCardItem
            key={card.id}
            card={card}
            view={view}
            onClick={onCardClick ? () => onCardClick(card) : undefined}
          />
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
