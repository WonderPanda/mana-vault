import { eventIterator } from "@orpc/server";
import { db } from "@mana-vault/db";
import { tag } from "@mana-vault/db/schema/app";
import { and, asc, eq, gt, or } from "drizzle-orm";
import z from "zod";

import { protectedProcedure } from "../index";
import {
  tagPublisher,
  toTagReplicationDoc,
  type TagStreamEvent,
} from "../publishers/tag-publisher";

const checkpointSchema = z
  .object({
    id: z.string(),
    updatedAt: z.number(),
  })
  .nullable();

const tagDocSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
  isSystem: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
  _deleted: z.boolean(),
});

export const tagsRouter = {
  sync: {
    push: protectedProcedure
      .input(
        z.object({
          rows: z.array(
            z.object({
              newDocumentState: tagDocSchema,
              assumedMasterState: tagDocSchema.nullable(),
            }),
          ),
        }),
      )
      .handler(async ({ context, input }) => {
        const userId = context.session.user.id;
        const { rows } = input;
        const conflicts: z.infer<typeof tagDocSchema>[] = [];
        const changedDocs: z.infer<typeof tagDocSchema>[] = [];

        for (const row of rows) {
          const { newDocumentState, assumedMasterState } = row;

          // Look up current master state
          const [currentRow] = await db
            .select()
            .from(tag)
            .where(and(eq(tag.id, newDocumentState.id), eq(tag.userId, userId)))
            .limit(1);

          if (!currentRow && !assumedMasterState) {
            // New document — insert
            const now = new Date();
            const [inserted] = await db
              .insert(tag)
              .values({
                id: newDocumentState.id,
                userId,
                name: newDocumentState.name,
                color: newDocumentState.color,
                isSystem: newDocumentState.isSystem,
                createdAt: now,
                updatedAt: now,
                deletedAt: newDocumentState._deleted ? now : null,
              })
              .returning();

            if (inserted) {
              changedDocs.push(toTagReplicationDoc(inserted, newDocumentState._deleted));
            }
          } else if (currentRow) {
            // Check if assumed state matches current master (compare updatedAt)
            const masterUpdatedAt = currentRow.updatedAt.getTime();
            const assumedUpdatedAt = assumedMasterState?.updatedAt;

            if (assumedUpdatedAt === masterUpdatedAt) {
              // Match — apply the write
              const [updated] = await db
                .update(tag)
                .set({
                  name: newDocumentState.name,
                  color: newDocumentState.color,
                  isSystem: newDocumentState.isSystem,
                  deletedAt: newDocumentState._deleted ? new Date() : null,
                })
                .where(and(eq(tag.id, newDocumentState.id), eq(tag.userId, userId)))
                .returning();

              if (updated) {
                changedDocs.push(toTagReplicationDoc(updated, newDocumentState._deleted));
              }
            } else {
              // Conflict — return current master state
              conflicts.push(toTagReplicationDoc(currentRow, currentRow.deletedAt !== null));
            }
          } else {
            // Row doesn't exist but client assumed it did — conflict (row was deleted)
            // Return the assumed state as deleted so client knows it's gone
            if (assumedMasterState) {
              conflicts.push({ ...assumedMasterState, _deleted: true });
            }
          }
        }

        // Publish changed docs to SSE stream for other clients
        if (changedDocs.length > 0) {
          const lastDoc = changedDocs[changedDocs.length - 1]!;
          const event: TagStreamEvent = {
            documents: changedDocs,
            checkpoint: { id: lastDoc.id, updatedAt: lastDoc.updatedAt },
          };
          await tagPublisher.publish(userId, event);
        }

        return { conflicts };
      }),

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
