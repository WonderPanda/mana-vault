/**
 * Generic helper to convert a database row into a replication document.
 *
 * Copies all fields from the source, converts Date fields to epoch
 * milliseconds, and adds `_deleted`.
 *
 * @param doc - The database row (Drizzle select result)
 * @param dateFields - Array of field names that contain Date values to convert
 * @param deleted - Whether this document represents a deletion (default false)
 * @returns The replication document with dates as numbers and `_deleted` set
 */
export function toReplicationDoc<T extends Record<string, unknown>>(
  doc: T,
  dateFields: readonly (keyof T)[],
  deleted = false,
): {
  [K in keyof T]: T[K] extends Date ? number : T[K] extends Date | null ? number | null : T[K];
} & {
  _deleted: boolean;
} {
  const result = { ...doc, _deleted: deleted } as any;
  for (const field of dateFields) {
    const val = doc[field];
    if (val instanceof Date) {
      result[field] = val.getTime();
    } else if (val === null) {
      result[field] = null;
    }
  }
  return result;
}
