import { ORPCError } from "@orpc/server";
import { db } from "@mana-vault/db";
import { scryfallCard } from "@mana-vault/db/schema/app";
import { sql } from "drizzle-orm";
import z from "zod";

import { adminProcedure, protectedProcedure } from "../index";

const ADMIN_EMAIL = "jesse@thecarters.cloud";

/** Headers required by Scryfall API */
const SCRYFALL_HEADERS = {
  "User-Agent": "ManaVault/1.0",
  Accept: "application/json",
};

/**
 * Scryfall bulk data types available from their API
 */
const BULK_DATA_TYPES = {
  oracle_cards: "Oracle Cards (~170MB) - One card per Oracle ID, most recognizable versions",
  unique_artwork: "Unique Artwork (~240MB) - All unique artworks with best scans",
  default_cards: "Default Cards (~525MB) - Every card in English or printed language",
  all_cards: "All Cards (~2.5GB) - Every card in every language",
} as const;

type BulkDataType = keyof typeof BULK_DATA_TYPES;

/**
 * Scryfall bulk data API response
 */
interface ScryfallBulkDataResponse {
  object: string;
  has_more: boolean;
  data: Array<{
    object: string;
    id: string;
    type: string;
    updated_at: string;
    uri: string;
    name: string;
    description: string;
    size: number;
    download_uri: string;
    content_type: string;
    content_encoding: string;
  }>;
}

export const adminRouter = {
  /**
   * Check if the current user is an admin
   */
  isAdmin: protectedProcedure.handler(({ context }) => {
    return context.session.user.email === ADMIN_EMAIL;
  }),

  /**
   * Get stats about the scryfall_card table
   */
  getScryfallStats: adminProcedure.handler(async () => {
    const [stats] = await db
      .select({
        totalCards: sql<number>`count(*)`,
        uniqueSets: sql<number>`count(distinct ${scryfallCard.setCode})`,
        cardsWithImages: sql<number>`count(case when ${scryfallCard.imageUri} is not null then 1 end)`,
      })
      .from(scryfallCard);

    return stats ?? { totalCards: 0, uniqueSets: 0, cardsWithImages: 0 };
  }),

  /**
   * Get available Scryfall bulk data options
   */
  getBulkDataOptions: adminProcedure.handler(async () => {
    // Fetch the bulk data manifest from Scryfall
    const response = await fetch("https://api.scryfall.com/bulk-data", {
      headers: SCRYFALL_HEADERS,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch bulk data manifest: ${response.status}`);
    }

    const manifest = (await response.json()) as ScryfallBulkDataResponse;

    // Return relevant info for each bulk data type
    return manifest.data
      .filter((item) => item.type in BULK_DATA_TYPES)
      .map((item) => ({
        type: item.type as BulkDataType,
        name: item.name,
        description: item.description,
        size: item.size,
        sizeFormatted: formatBytes(item.size),
        updatedAt: item.updated_at,
        downloadUri: item.download_uri,
      }));
  }),

  /**
   * Queue a Scryfall bulk data import job.
   * The import runs in a background queue worker with extended timeout limits.
   */
  queueScryfallImport: adminProcedure
    .input(
      z.object({
        /** Which bulk data type to import */
        bulkDataType: z.enum(["oracle_cards", "unique_artwork", "default_cards", "all_cards"]),
        /** Only include English cards (only applicable for all_cards) */
        englishOnly: z.boolean().default(true),
      }),
    )
    .handler(async ({ context, input }) => {
      const queue = context.scryfallImportQueue;

      if (!queue) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Import queue not available. This feature requires Cloudflare Workers.",
        });
      }

      // First, get the download URL from Scryfall's bulk data API
      const manifestResponse = await fetch("https://api.scryfall.com/bulk-data", {
        headers: SCRYFALL_HEADERS,
      });
      if (!manifestResponse.ok) {
        throw new Error(`Failed to fetch bulk data manifest: ${manifestResponse.status}`);
      }

      const manifest = (await manifestResponse.json()) as ScryfallBulkDataResponse;
      const bulkData = manifest.data.find((item) => item.type === input.bulkDataType);

      if (!bulkData) {
        throw new Error(`Bulk data type '${input.bulkDataType}' not found`);
      }

      // Send the import job to the queue
      await queue.send({
        type: "scryfall-import",
        bulkDataType: input.bulkDataType,
        englishOnly: input.englishOnly,
        downloadUri: bulkData.download_uri,
      });

      console.log(`[Admin] Queued Scryfall import job: ${input.bulkDataType}`);

      return {
        queued: true,
        bulkDataType: input.bulkDataType,
        bulkDataName: bulkData.name,
        message: `Import job queued for ${bulkData.name}. This will run in the background.`,
      };
    }),

  /**
   * Clear all scryfall cards (use with caution!)
   */
  clearScryfallCards: adminProcedure.handler(async () => {
    // This will fail if there are foreign key references
    // which is intentional - don't delete cards that are in use
    try {
      await db.delete(scryfallCard);
      return {
        success: true,
        message: "All scryfall cards cleared",
      };
    } catch {
      return {
        success: false,
        message:
          "Cannot clear cards - some cards are referenced by collection cards or other tables",
      };
    }
  }),
};

/**
 * Format bytes to human readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
