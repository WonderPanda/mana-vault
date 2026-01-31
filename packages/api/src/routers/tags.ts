import { eventIterator } from "@orpc/server";
import { db } from "@mana-vault/db";
import { tag } from "@mana-vault/db/schema/app";
import { and, asc, eq, gt, or } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";
import { tagPublisher, type TagStreamEvent } from "../publishers/tag-publisher";

const checkpointSchema = z
  .object({
    id: z.string(),
    updatedAt: z.number(),
  })
  .nullable();

export const tagsRouter = {
  sync: {
    pull: protectedProcedure
      .input(
        z.object({
          checkpoint: checkpointSchema,
          batchSize: z.number().min(1).max(100).default(50),
        }),
      )
      .handler(async ({ context, input }) => {
        const userId = context.session.user.id;
        const { checkpoint, batchSize } = input;

        const userCondition = eq(tag.userId, userId);

        let documents;
        if (checkpoint) {
          documents = await db
            .select({
              id: tag.id,
              userId: tag.userId,
              name: tag.name,
              color: tag.color,
              isSystem: tag.isSystem,
              createdAt: tag.createdAt,
              updatedAt: tag.updatedAt,
              deletedAt: tag.deletedAt,
            })
            .from(tag)
            .where(
              and(
                userCondition,
                or(
                  gt(tag.updatedAt, new Date(checkpoint.updatedAt)),
                  and(eq(tag.updatedAt, new Date(checkpoint.updatedAt)), gt(tag.id, checkpoint.id)),
                ),
              ),
            )
            .orderBy(asc(tag.updatedAt), asc(tag.id))
            .limit(batchSize);
        } else {
          documents = await db
            .select({
              id: tag.id,
              userId: tag.userId,
              name: tag.name,
              color: tag.color,
              isSystem: tag.isSystem,
              createdAt: tag.createdAt,
              updatedAt: tag.updatedAt,
              deletedAt: tag.deletedAt,
            })
            .from(tag)
            .where(userCondition)
            .orderBy(asc(tag.updatedAt), asc(tag.id))
            .limit(batchSize);
        }

        const rxdbDocuments = documents.map((doc) => ({
          id: doc.id,
          name: doc.name,
          color: doc.color,
          isSystem: doc.isSystem,
          createdAt: doc.createdAt.getTime(),
          updatedAt: doc.updatedAt.getTime(),
          _deleted: doc.deletedAt !== null,
        }));

        const lastDoc = rxdbDocuments[rxdbDocuments.length - 1];
        const newCheckpoint = lastDoc
          ? { id: lastDoc.id, updatedAt: lastDoc.updatedAt }
          : checkpoint;

        return {
          documents: rxdbDocuments,
          checkpoint: newCheckpoint,
        };
      }),

    stream: protectedProcedure
      .output(eventIterator(z.custom<TagStreamEvent>()))
      .handler(async function* ({ context, signal }) {
        const userId = context.session.user.id;

        for await (const event of tagPublisher.subscribe(userId, { signal })) {
          yield event;
        }
      }),
  },
};
