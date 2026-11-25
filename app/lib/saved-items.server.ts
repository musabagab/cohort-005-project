import { and, desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { bookmarks, courses, lessons, modules, notes } from "~/db/schema";

export const MAX_NOTE_LENGTH = 2_000;

export type Db = BetterSQLite3Database<typeof schema>;

export function getBookmark(db: Db, userId: number, lessonId: number) {
  return db
    .select()
    .from(bookmarks)
    .where(
      and(eq(bookmarks.userId, userId), eq(bookmarks.lessonId, lessonId))
    )
    .get();
}

export function toggleBookmark(db: Db, userId: number, lessonId: number) {
  return db.transaction((tx) => {
    const inserted = tx
      .insert(bookmarks)
      .values({ userId, lessonId })
      .onConflictDoNothing({ target: [bookmarks.userId, bookmarks.lessonId] })
      .returning({ id: bookmarks.id })
      .get();

    if (inserted) return true;

    tx.delete(bookmarks)
      .where(
        and(eq(bookmarks.userId, userId), eq(bookmarks.lessonId, lessonId))
      )
      .run();
    return false;
  });
}

export function getNote(db: Db, userId: number, lessonId: number) {
  return db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), eq(notes.lessonId, lessonId)))
    .get();
}

export type SaveNoteResult =
  | { ok: true; note: typeof notes.$inferSelect | null }
  | { ok: false; error: string };

export function saveNote(
  db: Db,
  userId: number,
  lessonId: number,
  body: string,
  now: Date
): SaveNoteResult {
  const trimmed = body.trim();
  if (trimmed.length > MAX_NOTE_LENGTH) {
    return {
      ok: false,
      error: `Note must be ${MAX_NOTE_LENGTH.toLocaleString()} characters or fewer`,
    };
  }

  if (trimmed.length === 0) {
    db.delete(notes)
      .where(and(eq(notes.userId, userId), eq(notes.lessonId, lessonId)))
      .run();
    return { ok: true, note: null };
  }

  const timestamp = now.toISOString();
  const note = db
    .insert(notes)
    .values({
      userId,
      lessonId,
      body: trimmed,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflictDoUpdate({
      target: [notes.userId, notes.lessonId],
      set: { body: trimmed, updatedAt: timestamp },
    })
    .returning()
    .get();

  return { ok: true, note };
}

export function listSavedItems(db: Db, userId: number) {
  const lessonRef = {
    lessonId: lessons.id,
    lessonTitle: lessons.title,
    moduleTitle: modules.title,
    courseId: courses.id,
    courseTitle: courses.title,
    courseSlug: courses.slug,
  };

  const savedBookmarks = db
    .select({
      id: bookmarks.id,
      createdAt: bookmarks.createdAt,
      ...lessonRef,
    })
    .from(bookmarks)
    .innerJoin(lessons, eq(bookmarks.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(bookmarks.userId, userId))
    .orderBy(desc(bookmarks.createdAt))
    .all();

  const savedNotes = db
    .select({
      id: notes.id,
      body: notes.body,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
      ...lessonRef,
    })
    .from(notes)
    .innerJoin(lessons, eq(notes.lessonId, lessons.id))
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .innerJoin(courses, eq(modules.courseId, courses.id))
    .where(eq(notes.userId, userId))
    .orderBy(desc(notes.updatedAt))
    .all();

  return { savedBookmarks, savedNotes };
}
