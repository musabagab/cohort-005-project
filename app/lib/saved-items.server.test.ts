import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "~/db/schema";
import { createTestDb, seedBaseData } from "~/test/setup";
import {
  getBookmark,
  getNote,
  listSavedItems,
  MAX_NOTE_LENGTH,
  saveNote,
  toggleBookmark,
} from "./saved-items.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonIds: number[];

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  const courseModule = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "The module", position: 1 })
    .returning()
    .get();
  lessonIds = ["First lesson", "Second lesson"].map((title, index) =>
    db
      .insert(schema.lessons)
      .values({ moduleId: courseModule.id, title, position: index + 1 })
      .returning()
      .get().id
  );
});

describe("Bookmarks", () => {
  it("toggles one Bookmark per Student and Lesson", () => {
    expect(toggleBookmark(db, base.user.id, lessonIds[0])).toBe(true);
    expect(getBookmark(db, base.user.id, lessonIds[0])).toBeDefined();
    expect(toggleBookmark(db, base.user.id, lessonIds[0])).toBe(false);
    expect(getBookmark(db, base.user.id, lessonIds[0])).toBeUndefined();
  });

  it("enforces uniqueness for a Student and Lesson", () => {
    db.insert(schema.bookmarks)
      .values({ userId: base.user.id, lessonId: lessonIds[0] })
      .run();

    expect(() =>
      db
        .insert(schema.bookmarks)
        .values({ userId: base.user.id, lessonId: lessonIds[0] })
        .run()
    ).toThrow();
  });
});

describe("Notes", () => {
  it("creates and atomically replaces a Note while preserving its creation time", () => {
    const createdAt = new Date("2026-11-25T08:00:00.000Z");
    const updatedAt = new Date("2026-11-25T09:00:00.000Z");

    expect(
      saveNote(db, base.user.id, lessonIds[0], "  first body  ", createdAt)
    ).toMatchObject({ ok: true, note: { body: "first body" } });
    expect(
      saveNote(db, base.user.id, lessonIds[0], "replacement", updatedAt)
    ).toMatchObject({ ok: true, note: { body: "replacement" } });

    const rows = db
      .select()
      .from(schema.notes)
      .where(
        and(
          eq(schema.notes.userId, base.user.id),
          eq(schema.notes.lessonId, lessonIds[0])
        )
      )
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      body: "replacement",
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });
  });

  it("accepts exactly 2,000 trimmed characters", () => {
    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      `  ${"x".repeat(MAX_NOTE_LENGTH)}  `,
      new Date()
    );

    expect(result).toMatchObject({ ok: true });
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toHaveLength(
      MAX_NOTE_LENGTH
    );
  });

  it("rejects a longer Note and preserves the saved text", () => {
    saveNote(db, base.user.id, lessonIds[0], "keep this", new Date());

    const result = saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "x".repeat(MAX_NOTE_LENGTH + 1),
      new Date()
    );

    expect(result).toMatchObject({ ok: false });
    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe("keep this");
  });

  it("preserves line breaks, Markdown characters, and HTML as plain text", () => {
    const body = "# heading\n<script>alert('no')</script>";

    saveNote(db, base.user.id, lessonIds[0], body, new Date());

    expect(getNote(db, base.user.id, lessonIds[0])?.body).toBe(body);
  });
});

describe("Saved items", () => {
  it("returns only the owner's rows in newest-first order", () => {
    const otherStudent = db
      .insert(schema.users)
      .values({
        name: "Other Student",
        email: "other@example.com",
        role: schema.UserRole.Student,
      })
      .returning()
      .get();
    db.insert(schema.bookmarks)
      .values([
        {
          userId: base.user.id,
          lessonId: lessonIds[0],
          createdAt: "2026-11-25T08:00:00.000Z",
        },
        {
          userId: base.user.id,
          lessonId: lessonIds[1],
          createdAt: "2026-11-25T09:00:00.000Z",
        },
        {
          userId: otherStudent.id,
          lessonId: lessonIds[0],
          createdAt: "2026-11-25T10:00:00.000Z",
        },
      ])
      .run();
    saveNote(
      db,
      base.user.id,
      lessonIds[0],
      "older",
      new Date("2026-11-25T08:00:00.000Z")
    );
    saveNote(
      db,
      base.user.id,
      lessonIds[1],
      "newer",
      new Date("2026-11-25T09:00:00.000Z")
    );
    saveNote(db, otherStudent.id, lessonIds[0], "private", new Date());

    const result = listSavedItems(db, base.user.id);

    expect(result.savedBookmarks.map((item) => item.lessonId)).toEqual([
      lessonIds[1],
      lessonIds[0],
    ]);
    expect(result.savedNotes.map((item) => item.body)).toEqual([
      "newer",
      "older",
    ]);
  });

  it("keeps Bookmarks and Notes after an Enrollment is removed", () => {
    db.insert(schema.enrollments)
      .values({ userId: base.user.id, courseId: base.course.id })
      .run();
    toggleBookmark(db, base.user.id, lessonIds[0]);
    saveNote(db, base.user.id, lessonIds[0], "retain me", new Date());

    db.delete(schema.enrollments)
      .where(
        and(
          eq(schema.enrollments.userId, base.user.id),
          eq(schema.enrollments.courseId, base.course.id)
        )
      )
      .run();

    expect(listSavedItems(db, base.user.id)).toMatchObject({
      savedBookmarks: [{ lessonId: lessonIds[0] }],
      savedNotes: [{ lessonId: lessonIds[0], body: "retain me" }],
    });
  });
});
