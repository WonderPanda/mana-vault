import { useLiveQuery } from "@tanstack/react-db";

import { useDbCollections } from "@/lib/db/db-context";

export function useTags() {
  const { tagCollection } = useDbCollections();

  return useLiveQuery(
    (q) => q.from({ tag: tagCollection }).orderBy(({ tag }) => tag.name, "asc"),
    [],
  );
}
