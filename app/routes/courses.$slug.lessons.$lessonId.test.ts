import { beforeEach, describe, expect, it, vi } from "vitest";
import { UserRole } from "~/db/schema";

const mocks = vi.hoisted(() => ({
  selectedRows: [] as unknown[],
  getCurrentUserId: vi.fn(),
  requireContentAccess: vi.fn(),
  toggleBookmark: vi.fn(),
  saveNote: vi.fn(),
}));

vi.mock("~/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: vi.fn(() => mocks.selectedRows.shift()),
        })),
      })),
    })),
  },
}));

vi.mock("~/lib/session", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
}));

vi.mock("~/lib/access.server", () => ({
  getAccess: vi.fn(),
  requireContentAccess: mocks.requireContentAccess,
}));

vi.mock("~/lib/saved-items.server", () => ({
  getBookmark: vi.fn(),
  getNote: vi.fn(),
  MAX_NOTE_LENGTH: 2_000,
  saveNote: mocks.saveNote,
  toggleBookmark: mocks.toggleBookmark,
}));

import { action } from "./courses.$slug.lessons.$lessonId";

function savedItemRequest(intent: "toggle-bookmark" | "save-note") {
  const formData = new FormData();
  formData.set("intent", intent);
  if (intent === "save-note") formData.set("body", "My private note");
  return new Request("http://cadence.test/courses/course/lessons/10", {
    method: "POST",
    body: formData,
  });
}

function actionArgs(intent: "toggle-bookmark" | "save-note" = "toggle-bookmark") {
  return {
    params: { slug: "course", lessonId: "10" },
    request: savedItemRequest(intent),
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.selectedRows = [
    { id: 100, slug: "course" },
    { id: 10, moduleId: 20 },
    { id: 20, courseId: 100 },
  ];
  mocks.getCurrentUserId.mockResolvedValue(1);
  mocks.requireContentAccess.mockResolvedValue({
    userId: 1,
    user: { id: 1, role: UserRole.Student },
    canViewContent: true,
  });
  mocks.toggleBookmark.mockReturnValue(true);
});

describe("Lesson saved-item action access", () => {
  it("requires content access on a direct Bookmark submission", async () => {
    mocks.requireContentAccess.mockRejectedValue(
      new Response("You must be enrolled in this course.", { status: 403 })
    );

    await expect(action(actionArgs())).rejects.toMatchObject({ status: 403 });
    expect(mocks.toggleBookmark).not.toHaveBeenCalled();
  });

  it("requires content access on a direct Note submission", async () => {
    mocks.requireContentAccess.mockRejectedValue(
      new Response("You must be enrolled in this course.", { status: 403 })
    );

    await expect(action(actionArgs("save-note"))).rejects.toMatchObject({
      status: 403,
    });
    expect(mocks.saveNote).not.toHaveBeenCalled();
  });

  it("rejects staff even though the content-access helper admits them", async () => {
    mocks.requireContentAccess.mockResolvedValue({
      userId: 2,
      user: { id: 2, role: UserRole.Instructor },
      canViewContent: true,
    });

    await expect(action(actionArgs())).rejects.toMatchObject({
      init: { status: 403 },
    });
    expect(mocks.toggleBookmark).not.toHaveBeenCalled();
  });

  it("rejects a Lesson that does not belong to the Course in the URL", async () => {
    mocks.selectedRows[2] = { id: 20, courseId: 999 };

    await expect(action(actionArgs())).rejects.toMatchObject({
      init: { status: 404 },
    });
    expect(mocks.requireContentAccess).not.toHaveBeenCalled();
    expect(mocks.toggleBookmark).not.toHaveBeenCalled();
  });

  it("lets an eligible Student toggle the Bookmark", async () => {
    await expect(action(actionArgs())).resolves.toEqual({
      ok: true,
      bookmarked: true,
    });
    expect(mocks.toggleBookmark).toHaveBeenCalledWith(expect.anything(), 1, 10);
  });
});
