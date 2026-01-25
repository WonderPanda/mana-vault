import { ORPCError } from "@orpc/server";
import { db } from "@mana-vault/db";
import { virtualList, virtualListCard } from "@mana-vault/db/schema/app";
import { and, asc, eq, sql } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";

export const listsRouter = {
	// List all virtual lists for the current user with card counts
	list: protectedProcedure.handler(async ({ context }) => {
		const userId = context.session.user.id;

		const lists = await db
			.select({
				id: virtualList.id,
				name: virtualList.name,
				description: virtualList.description,
				sourceType: virtualList.sourceType,
				sourceName: virtualList.sourceName,
				snapshotDate: virtualList.snapshotDate,
				createdAt: virtualList.createdAt,
				updatedAt: virtualList.updatedAt,
				cardCount: sql<number>`count(${virtualListCard.id})`.as("card_count"),
			})
			.from(virtualList)
			.leftJoin(virtualListCard, eq(virtualListCard.virtualListId, virtualList.id))
			.where(eq(virtualList.userId, userId))
			.groupBy(virtualList.id)
			.orderBy(asc(virtualList.name));

		return lists;
	}),

	// Get a single list by ID
	get: protectedProcedure
		.input(z.object({ id: z.string() }))
		.handler(async ({ context, input }) => {
			const userId = context.session.user.id;

			const [list] = await db
				.select({
					id: virtualList.id,
					name: virtualList.name,
					description: virtualList.description,
					sourceType: virtualList.sourceType,
					sourceName: virtualList.sourceName,
					snapshotDate: virtualList.snapshotDate,
					createdAt: virtualList.createdAt,
					updatedAt: virtualList.updatedAt,
					cardCount: sql<number>`count(${virtualListCard.id})`.as("card_count"),
				})
				.from(virtualList)
				.leftJoin(virtualListCard, eq(virtualListCard.virtualListId, virtualList.id))
				.where(and(eq(virtualList.id, input.id), eq(virtualList.userId, userId)))
				.groupBy(virtualList.id);

			if (!list) {
				throw new ORPCError("NOT_FOUND", { message: "List not found" });
			}

			return list;
		}),

	// Create a new virtual list
	create: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1).max(100),
				description: z.string().max(500).optional(),
				sourceType: z.enum(["gift", "purchase", "trade", "other"]).optional(),
				sourceName: z.string().max(100).optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const userId = context.session.user.id;

			const [list] = await db
				.insert(virtualList)
				.values({
					userId,
					name: input.name,
					description: input.description ?? null,
					sourceType: input.sourceType ?? null,
					sourceName: input.sourceName ?? null,
				})
				.returning();

			return list;
		}),
};
