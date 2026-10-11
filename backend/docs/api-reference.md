# API reference (backend)

All routes live under `/api/v1`, except `GET /health` and `GET /health/db`. This is the consolidated route index (90 routes). The detailed behaviour, envelopes
and rules of each area are in [architecture.md](./architecture.md); this page is the map and the quick contract. The route list was produced from the
controllers on 2026-10-11 and is checked by reading them again whenever routes change.

## Conventions

- **Auth:** admin routes need `Authorization: Bearer <accessToken>` from `POST /admin/auth/login`. Roles are `ADMIN`, `EDITOR`, `REVIEWER`. Public routes
  (marked _public_) are anonymous.
- **Errors:** `{ statusCode, code, message, details?, requestId }`. 400 `VALIDATION_FAILED` (with `details`), 401, 403, 404, 409 (conflict, stale version,
  invalid transition), 422 (a publish readiness report), 429.
- **Versioning:** editable resources carry a `version`; send it back as `version` / `expectedVersion` to detect concurrent edits (409).
- **Public caching:** public 200/304 carry a strong `ETag` and `Cache-Control: public, no-cache`; every error is `no-store`.
- **Request ids:** every response carries `x-request-id`.

Role sets used below: **read** = ADMIN, EDITOR, REVIEWER · **write** = ADMIN, EDITOR · **submit** = ADMIN, EDITOR · **request-changes / approve** = ADMIN,
REVIEWER · **publish / unpublish** = ADMIN.

## Health and authentication

| Method | Route                  | Access        | Purpose                                                                     |
| ------ | ---------------------- | ------------- | --------------------------------------------------------------------------- |
| GET    | `/health`              | public        | process is up                                                               |
| GET    | `/health/db`           | public        | database reachable                                                          |
| POST   | `/admin/auth/login`    | public        | `{ email, password }` → access token (+ refresh cookie)                     |
| POST   | `/admin/auth/refresh`  | public        | rotates the refresh cookie, returns a new access token                      |
| POST   | `/admin/auth/logout`   | public        | revokes the refresh token                                                   |
| GET    | `/admin/auth/me`       | authenticated | the signed-in admin                                                         |
| POST   | `/admin/auth/password` | authenticated | `{ currentPassword, newPassword }` → ends all sessions, returns a fresh one |

## Account management (ADMIN only)

| Method | Route                                       | Purpose                                                                                                    |
| ------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| POST   | `/admin/accounts`                           | create `{ email, role, temporaryPassword }` (must change the password at first use)                        |
| GET    | `/admin/accounts`                           | list (`limit`, `offset`); no secrets                                                                       |
| GET    | `/admin/accounts/:accountId`                | one account                                                                                                |
| GET    | `/admin/accounts/:accountId/events`         | audit trail, newest first                                                                                  |
| PUT    | `/admin/accounts/:accountId/role`           | `{ role }`                                                                                                 |
| POST   | `/admin/accounts/:accountId/disable`        | disable; ends all sessions immediately                                                                     |
| POST   | `/admin/accounts/:accountId/enable`         | enable                                                                                                     |
| POST   | `/admin/accounts/:accountId/password-reset` | `{ temporaryPassword }` (mandatory) — replaces the password, ends all sessions; the account must change it |

While an account must change its password every route except `/admin/auth/me` and `/admin/auth/password` answers 403 with
`details.reason: "PASSWORD_CHANGE_REQUIRED"`. The last active ADMIN cannot be disabled or demoted (409), and no ADMIN can disable, demote or force a reset
of their own account. Details: [architecture.md](./architecture.md#account-management-admin-only).

## Curriculum (courses and modules)

| Method | Route                                        | Roles | Purpose                                                                    |
| ------ | -------------------------------------------- | ----- | -------------------------------------------------------------------------- |
| POST   | `/admin/courses`                             | write | create (`title`, `description?`)                                           |
| GET    | `/admin/courses`                             | read  | list (`limit`, `offset`)                                                   |
| GET    | `/admin/courses/:courseId`                   | read  | one course                                                                 |
| PATCH  | `/admin/courses/:courseId`                   | write | edit (an edit returns the course to DRAFT)                                 |
| DELETE | `/admin/courses/:courseId`                   | ADMIN | delete (409 if it has modules or publication history)                      |
| POST   | `/admin/courses/:courseId/modules`           | write | create (`title`, `description?`, `position?`)                              |
| GET    | `/admin/courses/:courseId/modules`           | read  | list in order                                                              |
| PUT    | `/admin/courses/:courseId/modules/order`     | write | `{ moduleIds }` — a changed order is an edit of the course (back to DRAFT) |
| GET    | `/admin/courses/:courseId/modules/:moduleId` | read  | one module                                                                 |
| PATCH  | `/admin/courses/:courseId/modules/:moduleId` | write | edit                                                                       |
| DELETE | `/admin/courses/:courseId/modules/:moduleId` | write | delete (409 if it has lessons or history)                                  |

## Lessons and blocks

| Method | Route                                                      | Roles | Purpose                                                                         |
| ------ | ---------------------------------------------------------- | ----- | ------------------------------------------------------------------------------- |
| POST   | `/admin/courses/:courseId/modules/:moduleId/lessons`       | write | create (`title`, `levels`, optional short title, subtitle, …)                   |
| GET    | `/admin/courses/:courseId/modules/:moduleId/lessons`       | read  | list in order                                                                   |
| PUT    | `/admin/courses/:courseId/modules/:moduleId/lessons/order` | write | `{ lessonIds }` — a changed order is an edit of the module                      |
| GET    | `/admin/lessons/:lessonId`                                 | read  | one lesson                                                                      |
| PATCH  | `/admin/lessons/:lessonId`                                 | write | edit                                                                            |
| PUT    | `/admin/lessons/:lessonId/levels`                          | write | replace the lesson's available levels                                           |
| DELETE | `/admin/lessons/:lessonId`                                 | write | delete (409 with publication history)                                           |
| POST   | `/admin/lessons/:lessonId/blocks`                          | write | create a block (`type`, `sharedContent`, `levels`); only `RICH_TEXT` is enabled |
| GET    | `/admin/lessons/:lessonId/blocks`                          | read  | list                                                                            |
| PUT    | `/admin/lessons/:lessonId/blocks/order`                    | write | reorder                                                                         |
| GET    | `/admin/lessons/:lessonId/blocks/:blockId`                 | read  | one block                                                                       |
| PATCH  | `/admin/lessons/:lessonId/blocks/:blockId`                 | write | edit shared content                                                             |
| POST   | `/admin/lessons/:lessonId/blocks/:blockId/duplicate`       | write | copy                                                                            |
| DELETE | `/admin/lessons/:lessonId/blocks/:blockId`                 | write | delete                                                                          |
| PUT    | `/admin/lessons/:lessonId/blocks/:blockId/levels/:level`   | write | set a per-level variant                                                         |
| DELETE | `/admin/lessons/:lessonId/blocks/:blockId/levels/:level`   | write | remove a per-level variant                                                      |
| GET    | `/admin/lessons/:lessonId/preview?level=`                  | read  | the lesson as a learner would see it at a level (working copy)                  |

`RICH_TEXT` content is `{ "body": { "type": "doc", "content": [ … ] } }` (see architecture.md, "Lesson blocks"). The other 18 block identifiers exist but are
rejected until their contracts are specified.

## Lesson workflow and publications

| Method | Route                                                          | Roles           | Purpose                                                |
| ------ | -------------------------------------------------------------- | --------------- | ------------------------------------------------------ |
| GET    | `/admin/lessons/:lessonId/readiness`                           | read            | publish readiness report                               |
| GET    | `/admin/lessons/:lessonId/workflow`                            | read            | state, version, allowed actions                        |
| GET    | `/admin/lessons/:lessonId/workflow/events`                     | read            | history, newest first                                  |
| POST   | `/admin/lessons/:lessonId/workflow/submit`                     | submit          | DRAFT → READY_FOR_REVIEW                               |
| POST   | `/admin/lessons/:lessonId/workflow/request-changes`            | request-changes | READY_FOR_REVIEW → DRAFT (note required)               |
| POST   | `/admin/lessons/:lessonId/workflow/approve`                    | approve         | READY_FOR_REVIEW → APPROVED                            |
| POST   | `/admin/lessons/:lessonId/workflow/publish`                    | publish         | APPROVED → PUBLISHED, creates an immutable publication |
| POST   | `/admin/lessons/:lessonId/workflow/unpublish`                  | unpublish       | ends the active publication                            |
| GET    | `/admin/lessons/:lessonId/publications`                        | read            | publication history                                    |
| GET    | `/admin/lessons/:lessonId/publications/:version`               | read            | one publication                                        |
| GET    | `/admin/lessons/:lessonId/publications/:version/levels/:level` | read            | the stored snapshot of one level                       |
| GET    | `/admin/publishing/consistency`                                | ADMIN           | publication consistency report                         |

## Course and module workflow, catalog history

Same states, roles and bodies as the lesson workflow; `publish` of an already published course or module is a **refresh** (new catalog version, no outage).

| Method | Route                                                                                                    | Purpose                                                         |
| ------ | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| GET    | `/admin/courses/:courseId/workflow` and `…/workflow/events`                                              | state / history of a course                                     |
| POST   | `/admin/courses/:courseId/workflow/{submit,request-changes,approve,publish,unpublish}`                   | transitions of a course (publish includes its approved modules) |
| GET    | `/admin/courses/:courseId/modules/:moduleId/workflow` and `…/workflow/events`                            | state / history of a module                                     |
| POST   | `/admin/courses/:courseId/modules/:moduleId/workflow/{submit,request-changes,approve,publish,unpublish}` | transitions of a module                                         |
| GET    | `/admin/courses/:courseId/publications`                                                                  | catalog versions                                                |
| GET    | `/admin/courses/:courseId/publications/:version`                                                         | one catalog version                                             |
| GET    | `/admin/courses/:courseId/publications/:version/levels/:level`                                           | stored catalog snapshot of one level                            |

## Public (learner) API — anonymous, rate limited

`level` is required: `BEGINNER`, `INTERMEDIATE` or `ADVANCED`. Ids must be UUIDs. Anything not available is a 404.

| Method | Route                                  | Returns                                                                                             |
| ------ | -------------------------------------- | --------------------------------------------------------------------------------------------------- |
| GET    | `/courses?level=`                      | `{ level, courses: [{ courseId, catalogVersion, title, description, moduleCount, lessonCount }] }`  |
| GET    | `/courses/:courseId?level=`            | the course with its modules and lessons, each lesson with `previousLessonId` / `nextLessonId`       |
| GET    | `/lessons/:lessonId?level=`            | `{ lessonId, level, publicationVersion, contentHash, snapshot }` — the immutable published snapshot |
| GET    | `/lessons/:lessonId/navigation?level=` | `{ lessonId, level, courseId, moduleId, catalogVersion, previous, next }`                           |

A lesson is delivered only while it is published **and** listed by its course's active catalog version at that level. Send `If-None-Match` to revalidate (304).

## Media (admin only)

| Method | Route                           | Roles         | Purpose                                                                                    |
| ------ | ------------------------------- | ------------- | ------------------------------------------------------------------------------------------ |
| POST   | `/admin/media`                  | ADMIN, EDITOR | upload: multipart/form-data, one file in the field `file`; 201 with the metadata           |
| GET    | `/admin/media`                  | read          | list, newest first (`limit`, `offset`)                                                     |
| GET    | `/admin/media/:mediaId`         | read          | metadata: `{ id, originalFilename, contentType, sizeBytes, sha256, createdBy, createdAt }` |
| GET    | `/admin/media/:mediaId/content` | read          | the stored bytes (authenticated; type detected from the bytes; `nosniff`, no cache)        |
| DELETE | `/admin/media/:mediaId`         | ADMIN, EDITOR | delete the asset and its file (204)                                                        |

413 for a file over `MEDIA_MAX_BYTES`, 422 for an empty file or a type that is not allowed (the type is decided from the bytes), 404 if the asset or its
stored file is missing. No response contains a storage key or a path. Details and configuration: [architecture.md](./architecture.md#media-local-storage).

## Quizzes (basic; assumptions, see architecture.md)

| Method | Route                              | Access        | Purpose                                                                                                        |
| ------ | ---------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------- |
| POST   | `/admin/quizzes`                   | ADMIN, EDITOR | create a draft: `{ title, description?, questions: [{ prompt, explanation?, options: [{ text, correct }] }] }` |
| GET    | `/admin/quizzes`                   | read          | list with status and question count                                                                            |
| GET    | `/admin/quizzes/:quizId`           | read          | the full quiz including the correct options (staff only)                                                       |
| PUT    | `/admin/quizzes/:quizId`           | ADMIN, EDITOR | replace the content of a draft (`version` optional); 409 if published or stale                                 |
| POST   | `/admin/quizzes/:quizId/publish`   | ADMIN         | needs at least one question; 422 otherwise                                                                     |
| POST   | `/admin/quizzes/:quizId/unpublish` | ADMIN         |                                                                                                                |
| DELETE | `/admin/quizzes/:quizId`           | ADMIN, EDITOR | drafts only (204)                                                                                              |
| GET    | `/quizzes/:quizId`                 | public        | a published quiz without correct answers or explanations                                                       |
| POST   | `/quizzes/:quizId/submissions`     | public        | `{ answers: [{ questionId, optionId }] }` → `{ quizId, score, total, results[] }`; stateless                   |

## Not implemented (isolated, awaiting decisions)

Scripture/KJV data and the two Scripture block contracts (source licensing unresolved, see [scripture-source-research.md](./scripture-source-research.md)),
The quiz lesson block and lesson integration of quizzes, public media delivery and media-using blocks, the remaining 17 block contracts, learner accounts and progress. (Admin accounts are created through the account-management API, or by `npm run seed:admin` for the first ADMIN.)
