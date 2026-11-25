import { Link } from "react-router";
import type { Route } from "./+types/saved";
import { db } from "~/db";
import { UserRole } from "~/db/schema";
import { getAccess, requireStudent } from "~/lib/access.server";
import { Card, CardContent } from "~/components/ui/card";
import { Bookmark, NotebookPen } from "lucide-react";
import { formatRelativeTime } from "~/lib/utils";
import { listSavedItems } from "~/lib/saved-items.server";

export function meta() {
  return [
    { title: "Saved — Cadence" },
    { name: "description", content: "Your bookmarks and notes" },
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { userId } = await requireStudent(request);
  const allSavedItems = listSavedItems(db, userId);
  const courseIds = new Set([
    ...allSavedItems.savedBookmarks.map((item) => item.courseId),
    ...allSavedItems.savedNotes.map((item) => item.courseId),
  ]);
  const accessByCourse = await Promise.all(
    [...courseIds].map(async (courseId) => [
      courseId,
      await getAccess(request, courseId),
    ] as const)
  );
  const accessibleCourseIds = new Set(
    accessByCourse
      .filter(
        ([, access]) =>
          access.userId === userId &&
          access.user?.role === UserRole.Student &&
          access.canViewContent
      )
      .map(([courseId]) => courseId)
  );
  const savedBookmarks = allSavedItems.savedBookmarks
    .filter((item) => accessibleCourseIds.has(item.courseId))
    .map((item) => ({
      id: item.id,
      createdAt: item.createdAt,
      lessonId: item.lessonId,
      lessonTitle: item.lessonTitle,
      moduleTitle: item.moduleTitle,
      courseTitle: item.courseTitle,
      courseSlug: item.courseSlug,
    }));
  const savedNotes = allSavedItems.savedNotes
    .filter((item) => accessibleCourseIds.has(item.courseId))
    .map((item) => ({
      id: item.id,
      body: item.body,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      lessonId: item.lessonId,
      lessonTitle: item.lessonTitle,
      moduleTitle: item.moduleTitle,
      courseTitle: item.courseTitle,
      courseSlug: item.courseSlug,
    }));

  return { savedBookmarks, savedNotes };
}

export default function Saved({ loaderData }: Route.ComponentProps) {
  const { savedBookmarks, savedNotes } = loaderData;

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Saved</h1>
        <p className="text-sm text-muted-foreground">
          The lessons you flagged, and what you wrote about them.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <Bookmark className="size-4 text-muted-foreground" />
            Bookmarks
          </h2>

          {savedBookmarks.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No bookmarks yet.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {savedBookmarks.map((bookmark) => (
                <Card key={bookmark.id}>
                  <CardContent className="py-3">
                    <Link
                      to={`/courses/${bookmark.courseSlug}/lessons/${bookmark.lessonId}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {bookmark.lessonTitle}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {bookmark.courseTitle} · {bookmark.moduleTitle}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <NotebookPen className="size-4 text-muted-foreground" />
            Notes
          </h2>

          {savedNotes.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No notes yet.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {savedNotes.map((note) => (
                <Card key={note.id}>
                  <CardContent className="space-y-1 py-3">
                    <Link
                      to={`/courses/${note.courseSlug}/lessons/${note.lessonId}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {note.lessonTitle}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {note.courseTitle}
                    </p>
                    <p className="whitespace-pre-wrap text-sm">{note.body}</p>
                    <p
                      suppressHydrationWarning
                      className="text-xs text-muted-foreground"
                    >
                      Edited {formatRelativeTime(note.updatedAt)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
