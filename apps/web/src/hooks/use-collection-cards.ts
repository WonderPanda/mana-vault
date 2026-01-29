import { eq, useLiveQuery, useLiveSuspenseQuery } from "@tanstack/react-db";

import { useDbCollections } from "@/lib/db/db-context";
import type { CollectionCardDoc, CollectionCardLocationDoc, ScryfallCardDoc } from "@/lib/db/db";

export type CollectionCardWithScryfall = CollectionCardDoc & { scryfallCard: ScryfallCardDoc };

export type CollectionCardWithLocation = CollectionCardDoc & {
  scryfallCard: ScryfallCardDoc;
  location: CollectionCardLocationDoc;
};

/**
 * Hook that returns a single storage container (collection) by ID.
 */
export function useStorageContainer(containerId: string) {
  const { storageContainerCollection } = useDbCollections();

  const { data, ...rest } = useLiveQuery(
    (q) =>
      q
        .from({ container: storageContainerCollection })
        .where(({ container }) => eq(container.id, containerId)),
    [containerId],
  );

  return { data: data?.[0], ...rest };
}

/**
 * Hook that returns all storage containers (collections) for the current user.
 */
export function useStorageContainers() {
  const { storageContainerCollection } = useDbCollections();

  return useLiveQuery(
    (q) =>
      q
        .from({ container: storageContainerCollection })
        .orderBy(({ container }) => container.name, "asc"),
    [],
  );
}

/**
 * Hook that returns all collection cards for the current user.
 */
export function useCollectionCards() {
  const { collectionCardCollection, scryfallCardCollection } = useDbCollections();

  return useLiveQuery(
    (q) =>
      q
        .from({ collectionCard: collectionCardCollection })
        .innerJoin({ card: scryfallCardCollection }, ({ card, collectionCard }) =>
          eq(collectionCard.scryfallCardId, card.id),
        )
        .where(({ collectionCard }) => eq(collectionCard.status, "owned"))
        .orderBy(({ card }) => card.name, "asc")
        .select(({ collectionCard, card }) => ({
          ...collectionCard,
          scryfallCard: card,
        })),
    [],
  );
}

/**
 * Hook that returns the total count of owned collection cards.
 */
export function useCollectionCardCount() {
  const { collectionCardCollection } = useDbCollections();

  const { data, ...rest } = useLiveQuery(
    (q) =>
      q
        .from({ collectionCard: collectionCardCollection })
        .where(({ collectionCard }) => eq(collectionCard.status, "owned")),
    [],
  );

  return { data: data?.length ?? 0, ...rest };
}

/**
 * Hook that returns all collection cards in a specific storage container.
 */
export function useCollectionCardsByContainer(containerId: string) {
  const { collectionCardCollection, collectionCardLocationCollection, scryfallCardCollection } =
    useDbCollections();

  return useLiveSuspenseQuery(
    (q) =>
      q
        .from({ location: collectionCardLocationCollection })
        .where(({ location }) => eq(location.storageContainerId, containerId))
        .innerJoin({ collectionCard: collectionCardCollection }, ({ collectionCard, location }) =>
          eq(location.collectionCardId, collectionCard.id),
        )
        .innerJoin({ card: scryfallCardCollection }, ({ card, collectionCard }) =>
          eq(collectionCard.scryfallCardId, card.id),
        )
        .where(({ collectionCard }) => eq(collectionCard.status, "owned"))
        .orderBy(
          ({ collectionCard, card }) =>
            collectionCard.isFoil ? (card.priceUsdFoil ?? 0) : (card.priceUsd ?? 0),
          "desc",
        )
        .select(({ collectionCard, card, location }) => ({
          ...collectionCard,
          scryfallCard: card,
          location,
        })),
    [containerId],
  );
}

/**
 * Hook that returns all collection cards assigned to a specific deck.
 */
export function useCollectionCardsByDeck(deckId: string) {
  const { collectionCardCollection, collectionCardLocationCollection, scryfallCardCollection } =
    useDbCollections();

  return useLiveQuery(
    (q) =>
      q
        .from({ location: collectionCardLocationCollection })
        .where(({ location }) => eq(location.deckId, deckId))
        .innerJoin({ collectionCard: collectionCardCollection }, ({ collectionCard, location }) =>
          eq(location.collectionCardId, collectionCard.id),
        )
        .innerJoin({ card: scryfallCardCollection }, ({ card, collectionCard }) =>
          eq(collectionCard.scryfallCardId, card.id),
        )
        .where(({ collectionCard }) => eq(collectionCard.status, "owned"))
        .orderBy(({ card }) => card.name, "asc")
        .select(({ collectionCard, card, location }) => ({
          ...collectionCard,
          scryfallCard: card,
          location,
        })),
    [deckId],
  );
}
