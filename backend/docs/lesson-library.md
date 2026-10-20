# Lesson library and copied lessons

## Two kinds of lesson
- **Placed lesson** (all lessons before this change): belongs to a course, directly or through a module. It has a position, goes through review and publishing, and can be delivered once it is published and listed in the course's catalog.
- **Library lesson**: standalone, `course_id` and `module_id` are both NULL. It is an *authoring source*. It can be created, edited (metadata, cover, levels, blocks, related links), checked (readiness) and previewed like any lesson, but it can never be submitted, approved or published, and no learner endpoint, catalog or learner-facing link can reach it.

## Copying (copied reuse, not linking)
`POST /admin/lessons/:id/duplicate` now accepts an optional destination: `{ title?, courseId?, moduleId? }`.
- No destination = unchanged behaviour (copy next to the original; a library lesson's copy is another library lesson).
- `courseId` = directly in that course; `courseId` + `moduleId` = in that module (the module must belong to the course, else 404).
- The copy is an independent Draft appended at highest position + 1 of the destination. One transaction: lock the destination parent (module, else course), then the source lesson.
- Copied with new ids: metadata, cover reference, levels, ordered blocks, every block-level row (visibility and variants), authored related links. Media and quiz ids remain shared references; Scripture stamps are kept as they are; lessons with unsupported block types are refused.
- Never copied: status (Draft), version/revision counters, workflow events, approvals, publications, learner progress.
- There is no link back to the original and no synchronisation. Editing or publishing a copy never changes the original.
- Adding a lesson to a destination does not publish it and does not refresh the course catalog.

## API additions
- `GET /admin/lessons/library?q=&limit=&offset=` (ADMIN, EDITOR, REVIEWER): library lessons, newest change first.
- `POST /admin/lessons/library` (ADMIN, EDITOR): body as for creating a lesson (position is ignored).
- `courseId` in lesson responses and previews is now `string | null` (null = library lesson).
- Workflow: any action on a library lesson answers 422 `LIBRARY_LESSON` and `allowedActions` is empty. Related links cannot point at a library lesson.

## Schema (migration `1791850000000-AddLibraryLessons`, additive)
`lessons.course_id` becomes nullable; `chk_lessons_library_has_no_module` (a lesson without a course has no module); a partial index for the library list; a trigger refusing a `lesson_publications` insert for a library lesson (`lesson_publications.course_id` also stays NOT NULL). No row changes; existing lessons, positions and snapshots are untouched.

## Admin
Sidebar **Lessons** (library list, search, create, edit). In a course or module **Add lesson** offers *Create new lesson* or *Copy existing lesson* (searchable picker, editable title of the copy). A library lesson's editor shows "Library lesson — copy it into a course or module to publish it." and no publishing actions.
