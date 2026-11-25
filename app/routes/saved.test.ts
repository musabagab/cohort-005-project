import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserRole } from "~/db/schema";

const mocks = vi.hoisted(() => ({
  requireStudent: vi.fn(),
  getAccess: vi.fn(),
  listSavedItems: vi.fn(),
}));

vi.mock("~/lib/access.server", () => ({
  requireStudent: mocks.requireStudent,
  getAccess: mocks.getAccess,
}));

vi.mock("~/lib/saved-items.server", () => ({
  listSavedItems: mocks.listSavedItems,
}));

vi.mock("~/db", () => ({ db: {} }));

import { loader } from "./saved";

const accessibleBookmark = {
  id: 1,
  createdAt: "2026-11-25T09:00:00.000Z",
  lessonId: 10,
  lessonTitle: "Visible lesson",
  moduleTitle: "Visible module",
  courseId: 100,
  courseTitle: "Visible course",
  courseSlug: "visible-course",
};

const inaccessibleNote = {
  id: 2,
  body: "private text",
  createdAt: "2026-11-25T08:00:00.000Z",
  updatedAt: "2026-11-25T09:00:00.000Z",
  lessonId: 20,
  lessonTitle: "Hidden lesson",
  moduleTitle: "Hidden module",
  courseId: 200,
  courseTitle: "Hidden course",
  courseSlug: "hidden-course",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStudent.mockResolvedValue({
    userId: 1,
    user: { id: 1, role: UserRole.Student },
  });
  mocks.listSavedItems.mockReturnValue({
    savedBookmarks: [accessibleBookmark],
    savedNotes: [inaccessibleNote],
  });
  mocks.getAccess.mockImplementation((_request: Request, courseId: number) =>
    Promise.resolve({
      userId: 1,
      user: { id: 1, role: UserRole.Student },
      canViewContent: courseId === accessibleBookmark.courseId,
    })
  );
});

describe("Saved route access", () => {
  it("returns only items whose Courses the current Student can access", async () => {
    const result = await loader({
      request: new Request("http://cadence.test/saved"),
    } as never);

    expect(result.savedBookmarks).toEqual([
      expect.objectContaining({ lessonTitle: "Visible lesson" }),
    ]);
    expect(result.savedNotes).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("private text");
    expect(JSON.stringify(result)).not.toContain("Hidden course");
  });

  it("rejects anyone who is not an eligible Student before reading rows", async () => {
    mocks.requireStudent.mockRejectedValue(
      new Response("Only students can access saved lessons.", { status: 403 })
    );

    await expect(
      loader({ request: new Request("http://cadence.test/saved") } as never)
    ).rejects.toMatchObject({ status: 403 });
    expect(mocks.listSavedItems).not.toHaveBeenCalled();
  });
});
