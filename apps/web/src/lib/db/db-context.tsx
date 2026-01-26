import { createContext, useContext, type ReactNode } from "react";

import type { getOrCreateDb } from "./db";

type DbInstance = Awaited<ReturnType<typeof getOrCreateDb>>;

interface DbContextValue {
  deckCollection: DbInstance["deckCollection"];
  deckCardCollection: DbInstance["deckCardCollection"];
  storageContainerCollection: DbInstance["storageContainerCollection"];
  collectionCardCollection: DbInstance["collectionCardCollection"];
  collectionCardLocationCollection: DbInstance["collectionCardLocationCollection"];
  scryfallCardCollection: DbInstance["scryfallCardCollection"];
}

const DbContext = createContext<DbContextValue | null>(null);

interface DbProviderProps {
  children: ReactNode;
  db: DbInstance;
}

/**
 * Provides database collections to all children.
 * Should be used in the authenticated layout where db is available from loader.
 */
export function DbProvider({ children, db }: DbProviderProps) {
  return (
    <DbContext
      value={{
        deckCollection: db.deckCollection,
        deckCardCollection: db.deckCardCollection,
        storageContainerCollection: db.storageContainerCollection,
        collectionCardCollection: db.collectionCardCollection,
        collectionCardLocationCollection: db.collectionCardLocationCollection,
        scryfallCardCollection: db.scryfallCardCollection,
      }}
    >
      {children}
    </DbContext>
  );
}

/**
 * Access the database collections.
 * Must be used within a DbProvider (i.e., within authenticated routes).
 */
export function useDbCollections() {
  const context = useContext(DbContext);
  if (!context) {
    throw new Error("useDbCollections must be used within a DbProvider");
  }
  return context;
}
