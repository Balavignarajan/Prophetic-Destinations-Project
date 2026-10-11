# Backend architecture

NestJS **modular monolith**: one deployable, one Neon PostgreSQL database, strong module boundaries.
This is the approved design from the Phase 3A proposal; this file is the day-to-day reference.

## Layout

```
src/
  main.ts                 bootstrap only
  app.module.ts           wires the modules together
  config/                 typed, validated environment config
  database/               TypeORM connection, TransactionRunner, migrations/, CLI data-source
  platform/               HTTP plumbing only: exception filter, validation pipe, request id, logging
  shared-kernel/          LearningLevel, DomainError. Add here only what is truly domain-wide.
  modules/<name>/         one folder per domain module (below)
test/                     architecture rules + e2e
docs/                     this file
```

There is deliberately no `common/` or `utils/` folder.

## Modules

| Module     | Owns                                                                           | May import                                      |
| ---------- | ------------------------------------------------------------------------------ | ----------------------------------------------- |
| identity   | admin accounts, roles, auth, guards                                            | none                                            |
| curriculum | courses and **modules** (product term; keep it in code and UI)                 | identity                                        |
| lessons    | lessons, blocks, level variants, level availability, level resolution, preview | identity, curriculum, scripture, media, quizzes |
| scripture  | structured Scripture references                                                | identity                                        |
| media      | media library and storage adapter                                              | identity                                        |
| quizzes    | quizzes, questions, options                                                    | identity                                        |
| publishing | workflow transitions, audit events, published snapshots                        | identity, lessons, curriculum                   |
| delivery   | learner read API (no tables)                                                   | publishing                                      |
| health     | liveness and DB readiness                                                      | none                                            |

Rules (enforced by `test/architecture.spec.ts`):

- A module imports another module only through that module's `index.ts`.
- Only the dependencies in the table are allowed, and there are no cycles.
- `config`, `database`, `platform` and `shared-kernel` never import feature modules.
- Cross-module links are plain id columns, not TypeORM relations between modules' entities.

Planned internal shape of a module (create folders only when they have content):
`api/` (controllers, DTOs), `application/` (use cases), `domain/` (pure rules), `persistence/` (entities, repositories).

## Identity (admin authentication)

Admins are invite-only; there is no signup endpoint. The first ADMIN comes from `npm run seed:admin`
(reads `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`, safe to re-run, never prints the password).

- Routes are **default-deny**: a global `JwtAuthGuard` requires a valid access token unless the route is `@Public()`
  (`platform/public.decorator.ts`, so health and the later learner API need no dependency on identity).
- `@Roles(Role.X, ...)` restricts a route; roles are fixed in code (`ADMIN`, `EDITOR`, `REVIEWER`) and a role passes only if listed
  (ADMIN is not an implicit superuser). `RolesGuard` holds no business rules. Get the caller with `@CurrentAdmin()`.
- Other modules import `Role`, `Roles`, `CurrentAdmin` and `AuthenticatedAdmin` from `modules/identity` only.
- Access token: JWT (HS256, 15 min) with claims `sub`, `role`, `typ`. The guard re-reads the admin on every request,
  so disabling an account or changing a role applies immediately.
- Refresh token: random, rotated on every use, stored only as a SHA-256 hash, sent as an httpOnly `SameSite=Strict` cookie
  scoped to `/api/v1/admin/auth`. Tokens from one login form a _family_ (the session); replaying a rotated token revokes the family.
- Login and refresh are rate limited per IP (`AUTH_RATE_LIMIT` per `AUTH_RATE_WINDOW_SECONDS`).

| Endpoint                          | Auth                                |
| --------------------------------- | ----------------------------------- |
| `POST /api/v1/admin/auth/login`   | public, throttled                   |
| `POST /api/v1/admin/auth/refresh` | public (refresh cookie), throttled  |
| `POST /api/v1/admin/auth/logout`  | public (refresh cookie); always 204 |
| `GET  /api/v1/admin/auth/me`      | any authenticated admin             |

## Curriculum (courses and modules)

**Owns:** the `courses` and `course_modules` tables, and the Course and Module (product term, never "unit") rules.
**Does not own:** lessons, blocks, quizzes, scripture, media or publishing.
**Depends on:** identity only (`Role`/`Roles`). Lessons depend on curriculum through `CurriculumFacade` (exported from `index.ts`: `findModule`,
`lockModule`), which exposes only a module's id and course id. Entities are never exported. Curriculum never imports lessons: deleting a
module that still has lessons is refused by the `ON DELETE RESTRICT` foreign key, translated to a 409.

API (all authenticated, all under `/api/v1/admin`):

| Endpoint                                                                                         | Roles                   |
| ------------------------------------------------------------------------------------------------ | ----------------------- |
| `GET /courses`, `GET /courses/:courseId`                                                         | ADMIN, EDITOR, REVIEWER |
| `POST /courses`, `PATCH /courses/:courseId`                                                      | ADMIN, EDITOR           |
| `DELETE /courses/:courseId`                                                                      | ADMIN                   |
| `GET /courses/:courseId/modules`, `GET .../modules/:moduleId`                                    | ADMIN, EDITOR, REVIEWER |
| `POST /courses/:courseId/modules`, `PATCH .../modules/:moduleId`, `DELETE .../modules/:moduleId` | ADMIN, EDITOR           |
| `PUT /courses/:courseId/modules/order` (body `{ moduleIds: [...] }`)                             | ADMIN, EDITOR           |

The role matrix is an assumption (the requirements define none): reviewers read, editors write, only admins delete courses.

Rules:

- Titles are trimmed, not blank, at most 200 characters; descriptions at most 5000. The database repeats these as CHECK constraints.
- Modules have an explicit `position`, 1..n with no gaps and unique per course (`UNIQUE (course_id, position)`, deferrable so a shift or
  reorder is one statement). Create without a position appends; with a position it inserts there and pushes later modules down;
  a position beyond the end is a 422. Deleting a module closes the gap. `PUT .../order` must list every module exactly once (422 otherwise).
  Modules are always returned in position order. Courses are listed oldest first, with id as tie-breaker.
- Every change to a course's modules locks the course row first, so concurrent changes to one course run one at a time.
- **A course that still has modules cannot be deleted** (409, and the foreign key is `ON DELETE RESTRICT`). Remove its modules first.
- `status` (`DRAFT`, `READY_FOR_REVIEW`, `APPROVED`, `PUBLISHED`) is stored here but cannot be set through this API; new content is `DRAFT`
  and editing content puts it back to `DRAFT`. The Publishing module will own the transitions.
- `PATCH` accepts an optional `version`; if it is not the current version the update is refused with 409 (someone else edited first).
- Responses are explicit DTOs (`id`, `title`, `description`, `status`, `version`, `createdAt`, `updatedAt`, plus `courseId`/`position` for modules).

## Lessons (slice 3E-a: lessons and level availability)

**Owns:** `lessons` and `lesson_levels`. Blocks, block levels/variants and the resolver come in slices 3E-b and 3E-c; reusable (linked)
blocks are not designed into code yet and need a separate approval.
**Depends on:** curriculum (facade) and identity (`Role`/`Roles`). Scripture, Media and Quiz will be reached through their facades later.

Lesson fields: `title` (required, <= 200), `shortTitle` (<= 100), `subtitle` (<= 300), `introduction` (plain multi-paragraph text,
<= 5000, not Rich Text), `coverMediaId` (always null until the Media module exists; the API rejects anything else), `estimatedMinutes`
(whole number >= 1), plus `position`, `status`, `version`, timestamps. Title, short title, subtitle and introduction are level-independent:
there are no lesson-level variants. Level-specific content will live in blocks. Limits are backend validation limits: over-long input is
rejected with a validation error and never truncated; blank optional text is stored as none.

Level availability: one `lesson_levels` row per level the lesson is available at (`BEGINNER`, `INTERMEDIATE`, `ADVANCED`, from the shared
`LearningLevel`; there is no level table). A new lesson has no levels until the editor chooses them. `PUT /lessons/:id/levels` replaces the set;
unknown or duplicate levels are rejected, never merged.

Ordering is the same as for modules: `UNIQUE (module_id, position) DEFERRABLE`, single-statement shifts and bulk reorder, and a lock on the
parent **module** row (lock order is always Module, then Lesson). The pure ordering rules, `LearningLevel`, `ContentStatus` and the optimistic
version check live in `shared-kernel` because several modules use them.

| Endpoint                                                                     | Roles                   |
| ---------------------------------------------------------------------------- | ----------------------- |
| `GET /courses/:courseId/modules/:moduleId/lessons`, `GET /lessons/:lessonId` | ADMIN, EDITOR, REVIEWER |
| `POST /courses/:courseId/modules/:moduleId/lessons`, `PUT .../lessons/order` | ADMIN, EDITOR           |
| `PATCH /lessons/:lessonId`, `PUT /lessons/:lessonId/levels`                  | ADMIN, EDITOR           |
| `DELETE /lessons/:lessonId`                                                  | ADMIN, EDITOR           |

Role decision: the guide defines CMS actions but no lesson/block role matrix, so lessons follow the approved curriculum model exactly:
read for all three roles, write for ADMIN and EDITOR, and deleting a lesson is allowed to the same roles that may delete a Module (ADMIN and
EDITOR). Only deleting a Course is ADMIN-only. `status` cannot be set through the API; editing a lesson (including its levels) puts it back
to `DRAFT`. Lessons with blocks cannot be deleted once blocks exist (3E-b); published-lesson deletion is a Publishing decision.

## Lesson blocks (slice 3E-b)

**Owns:** `lesson_blocks` (and the trigger that keeps a block's type immutable). Level visibility, variants, the resolver and preview are in the
next section; reusable (linked) blocks are not built yet.

- A block is a _placement_ in a lesson: stable uuid `id`, immutable `type`, explicit `position` (1..n, `UNIQUE (lesson_id, position) DEFERRABLE`),
  `shared_content jsonb` (nullable = no content yet), its own `version`. The FK to `lessons` is `ON DELETE RESTRICT`.
- **BlockTypeRegistry** (`lessons/domain/blocks/registry.ts`) is the application source of truth. The 19 identifiers from the guide are listed in
  `block-types.ts` and in a database CHECK (a backstop; adding an implemented type needs no migration). The registry decides which types are
  _usable_: today **RICH_TEXT only**; any other defined type gets 422 "not available yet", an identifier outside the guide gets 400. Each
  definition provides `validateShape` (every save), `validateComplete` (publishing readiness), `extractReferences`, and `variants`
  (`SUPPORTED | NOT_SUPPORTED | UNCONFIRMED`; RICH_TEXT is `UNCONFIRMED`, to be treated as no variants until its contract settles it).
  Do not invent schemas for the other types: each is added only after its content contract is specified from the guide.
- **RICH_TEXT content** is structured JSON, never HTML: `{ "body": { "type": "doc", "content": [...] } }` with nodes `paragraph`,
  `bulletList`, `orderedList`, `listItem`, `text` and marks `bold`, `italic`, `link` (`attrs.href`). There are deliberately no heading nodes: major lesson transitions use the dedicated `SECTION_INTRO` block, and headings return only through an explicit content-contract decision. Strict allow-list: unknown nodes,
  marks, keys or attrs are rejected, as are markup-like keys (`html`, `onclick`, `style`, anything containing `<` or `>`, ...). Links must be absolute
  `https:`, `http:` or `mailto:` URLs with no whitespace or control characters. Limits: depth 8, 5000 nodes, 100,000 bytes (the database CHECK
  allows 200,000 as a backstop), 3 marks per text, NUL characters rejected. Text is plain text and is never interpreted as markup; clients must render it as text.
- A global `JsonDepthInterceptor` rejects request bodies nested deeper than 64 levels (400 `BODY_TOO_DEEPLY_NESTED`) before validation, because the
  validation pipe's object conversion recurses and would otherwise overflow the stack.
- Operations (all under `/api/v1/admin/lessons/:lessonId/blocks`; same roles as lessons: read ADMIN/EDITOR/REVIEWER, write and delete ADMIN/EDITOR):
  `GET`, `POST` (body `type`, optional `sharedContent`, optional `position`), `PUT order`, `GET|PATCH|DELETE :blockId`,
  `POST :blockId/duplicate`. `type` is accepted on create only. Duplicate makes an independent copy (new id, deep-copied content) right after the original.
- Every block operation locks the lesson row first, keeps positions 1..n, and puts the lesson back to `DRAFT` (without bumping the lesson's own
  `version`; blocks have their own). At most 500 blocks per lesson (sanity limit).
- A lesson that still has blocks cannot be deleted (409 with `blockCount`; the FK is the backstop).

## Block levels, variants and preview (slice 3E-c)

**Owns:** `lesson_block_levels`. Reusable (linked) blocks and the other 18 block types are not built.

- **Visibility = a row.** `lesson_block_levels (block_id, lesson_id, level, content)` has one row per block per level the block is visible at;
  no row means hidden. `content` is the _full-replacement variant_ for that level, or NULL to use the block's own `shared_content`. Nothing is ever
  merged or inherited, and a level never reads another level's row.
- **Database guarantees.** Primary key `(block_id, level)`. Two composite foreign keys, both `ON DELETE RESTRICT`: `(block_id, lesson_id)` ->
  `lesson_blocks (id, lesson_id)` (the row's lesson is the block's lesson) and `(lesson_id, level)` -> `lesson_levels` (a block can only be
  visible at levels its lesson is available at). The `UNIQUE (id, lesson_id)` on `lesson_blocks` that the first key needs is deliberately
  **not** deferrable. CHECKs: level is one of the three, content is a JSON object of at most 200,000 characters or NULL.
- **Variants need type support.** A variant is allowed only if the block type's registry entry says `variants: 'SUPPORTED'`. RICH_TEXT is
  `UNCONFIRMED`, so the real application rejects RICH_TEXT variants (422); visibility alone always works. Variant tests use a test-only registry override.
- **New blocks are hidden everywhere** unless `levels` is sent on create (they must be levels the lesson has). Blocks from before 3E-c have no
  rows, so they stay hidden until configured. Gaining a lesson level never makes a block visible there.
- **Removing a lesson level** is refused with 409 while any block is visible at it (the response names the blocks); hide them there first.
- **Endpoints** (`/api/v1/admin/lessons/:lessonId/...`; read: ADMIN/EDITOR/REVIEWER, write: ADMIN/EDITOR):
  `PUT blocks/:blockId/levels/:level` (body `{ "content": object | null, "version"? }`; the `content` key is required: `null` = visible using
  shared content, an object = the variant), `DELETE blocks/:blockId/levels/:level` (a block with a variant there needs `?discardVariant=true`;
  optional `?version=`), `GET preview?level=BEGINNER`. Block responses include `levels: [{ level, content }]` in canonical order.
- **Versions.** An _effective_ level change bumps the block's `version` and puts the lesson back to `DRAFT` without touching `lessons.version`.
  Writing what is already stored changes nothing. "Already stored" means JSON equality (`jsonContentEquals`): object key order is ignored at any
  depth (jsonb does not keep it), array order and all values matter, `null` only equals `null`. A stale `version` is a 409 even for a no-op.
  Lock order is Module, Lesson, Block. Duplicating a block copies its level rows; deleting a block deletes them explicitly in the same transaction.
- **The resolver** (`domain/level-resolution.ts`) is a pure function and the single implementation intended for preview, publishing and learner
  delivery: (1) the lesson must be available at the level; (2) a block is visible only if it has a row for that level; (3) a visible block shows its
  variant, else its own shared content, else it is _unresolved_; (4) only the requested level's row is ever read. Unresolved blocks are returned
  with a diagnostic and never skipped or replaced. Diagnostics: `LESSON_NOT_AVAILABLE_AT_LEVEL`, `NO_VISIBLE_BLOCKS` (available, but zero
  visible block rows; visible-but-unresolved blocks report their own instead), `BLOCK_NO_CONTENT`, `BLOCK_VARIANT_NOT_ALLOWED` (a stored variant for a
  type without variant support; no fallback to shared content). Hidden blocks never produce a diagnostic.
- **Preview is advisory.** It reads the lesson, blocks and level rows in separate unlocked queries, so under concurrent edits it can show a mix of old
  and new data; it does not check completeness (`validateComplete` is reserved for Publishing readiness) and changes nothing. A clean preview does not
  mean a lesson is ready to publish: Publishing must independently validate a consistent state of the content.

## Publishing foundation (slice 3F-a)

Phase 3F publishes **lessons only** (courses, modules and catalog snapshots are deferred; `ARCHIVED` is deferred and the four statuses and their
CHECK constraints are unchanged). Slice 3F-a adds no tables for publishing and no endpoints: it prepares the lessons module and the pure rules.

- **`lessons.content_revision`** counts _effective_ changes to a lesson's authoring content: metadata, level availability, block create / content
  change / duplicate / delete / reorder, and level visibility and variants. It moves **exactly once per logical change** (creating a block visible at
  three levels is one change). It does **not** move for workflow status transitions, rejected requests, reordering or creating or deleting sibling
  lessons, or edits to the module or course.
- **A request that would change nothing writes nothing** (one rule for every lesson authoring path). Identical lesson metadata (after trimming), the same
  set of levels, identical block content (JSON equality: object key order is ignored, array order and values count), the same block order, identical
  visibility or variant, and hiding a block that is already hidden all leave the lesson untouched: no `lessons.version` or block `version` bump, no
  `content_revision` move, no `updated_at` change, and **no reset of the status to `DRAFT`** (an APPROVED or PUBLISHED lesson stays that way). The request
  still takes the locks and still checks the expected `version` first, so a stale version is a 409 even for a no-op; response shapes and status codes
  are unchanged. A genuine change still bumps the relevant versions, moves the revision once and resets the lesson to `DRAFT`. Course and module `PATCH`
  (Phase 3D) are not lesson content and keep their existing behaviour. `lessons.version` keeps its meaning (lesson fields and level availability only).
  All writes happen under the Module, Lesson, Block lock order. Because every effective change also resets the status to `DRAFT`,
  `status = APPROVED` already means "unchanged since approval"; the revision is stored with workflow events and publications for audit and for
  showing "unpublished changes".
- **`LessonsFacade`** (exported from `lessons/index.ts`) is the only way Publishing reaches lessons, and returns plain data only:
  `lockForWorkflow` (locks the lesson row, the same lock every authoring writer takes first), `findWorkflowState` (unlocked read),
  `compareAndSetStatus(from, to)` (not an authoring change: neither `version` nor `content_revision` moves) and `assembleForPublication`
  (reads the lesson, blocks and level rows, then runs the pure resolver **separately for every available level** and checks each resolved block
  with its type's `validateShape` and `validateComplete`). The pure `resolveLesson` and its types are exported too.
- **Pure Publishing rules** (`publishing/domain`, no database):
  - `workflow.ts`: SUBMIT_FOR_REVIEW (DRAFT to READY_FOR_REVIEW), REQUEST_CHANGES (READY_FOR_REVIEW to DRAFT, note required), APPROVE
    (READY_FOR_REVIEW to APPROVED), PUBLISH (APPROVED to PUBLISHED), UNPUBLISH (ends the active publication; PUBLISHED becomes APPROVED, and a working copy that was edited after publishing keeps its status: DRAFT, READY_FOR_REVIEW or APPROVED. See slice 3F-c).
  - `roles.ts`: ADMIN and EDITOR submit; ADMIN and REVIEWER request changes and approve; ADMIN alone publishes and unpublishes; all three roles read.
  - `separation-of-duties.ts`: policy S0 (nothing enforced); a policy is a plain function, so stricter ones can be added later without touching the workflow.
  - `readiness.ts`: aggregates every blocking issue (never just the first). Sources are kept apart: RULE (title, at least one level, block
    content completeness), RESOLVER (any resolver diagnostic) and SAFEGUARD (invalid stored content, unavailable block type, a cover before Media exists,
    a level snapshot over 5 MiB). Title is the only mandatory metadata beyond the existing rules.
  - `snapshot-payload.ts`: the self-contained resolved payload of one level, its canonical (sorted-key) JSON, and the 5 MiB limit measured as serialized UTF-8 bytes.
    Storing, hashing and versioning snapshots arrive with the publication tables.

## Publishing workflow (slice 3F-b)

Review transitions for lessons, with an append-only audit trail. Publishing itself (publish/unpublish, publications, snapshots) is **not** implemented yet (3F-c).

**Endpoints** (all under `/api/v1/admin/lessons/:lessonId`):

| Method and path                 | Roles           | Effect                                                                      |
| ------------------------------- | --------------- | --------------------------------------------------------------------------- |
| `POST workflow/submit`          | ADMIN, EDITOR   | DRAFT → READY_FOR_REVIEW                                                    |
| `POST workflow/request-changes` | ADMIN, REVIEWER | READY_FOR_REVIEW → DRAFT; a nonblank note (≤ 2000 chars) is required        |
| `POST workflow/approve`         | ADMIN, REVIEWER | READY_FOR_REVIEW → APPROVED                                                 |
| `GET workflow`                  | all three       | status, content revision, the actions the caller may take now, latest event |
| `GET workflow/events`           | all three       | history, newest first, `limit` (1–100, default 50) / `offset`               |
| `GET readiness`                 | all three       | advisory readiness report; writes nothing, never gates a review transition  |

Transition bodies accept an optional `note` and an optional `expectedContentRevision` (stale → 409).

**History** lives in `lesson_workflow_events`: acting admin, role at the time, action, from/to status, note, the content revision the lesson had, and a database-assigned `seq` that defines order. DB triggers reject UPDATE, DELETE and TRUNCATE, and both foreign keys (lesson, admin) are RESTRICT. Consequently a lesson with any workflow history can no longer be deleted (controlled 409), and an admin who has acted cannot be deleted. There is no history-deletion API.

**Guarantees.** A transition runs in one transaction: lock the lesson row, check the optional expected revision, plan the transition from the locked status, compare-and-set the status, append the event. If any step fails nothing is kept. Concurrent transitions on one lesson serialize on the row lock; exactly one wins and the rest get 409. Transitions change only `status` (and `updated_at`); they never change `lessons.version` or `content_revision`. Any effective authoring edit still resets the lesson to DRAFT, so APPROVED means "unchanged since approval".

**Policy.** Role checks happen before any lock. Separation of duties is policy S0 (actors are recorded, nothing is enforced); a stricter policy can be supplied through the `SEPARATION_OF_DUTIES_POLICY` provider.

**Not in this slice:** publishing (added in slice 3F-c below), delivery (lock timeout: see slice 3F-d).

## Publishing and unpublishing (slice 3F-c)

ADMIN-only publish and unpublish of lessons, with immutable per-level snapshots. There is no learner-facing delivery yet (the Delivery module comes later), and only lessons are published (no course or module publishing, no ARCHIVED).

**Endpoints** (under `/api/v1/admin/lessons/:lessonId`):

| Method and path                           | Roles     | Effect                                                                                           |
| ----------------------------------------- | --------- | ------------------------------------------------------------------------------------------------ |
| `POST workflow/publish`                   | ADMIN     | APPROVED → PUBLISHED: creates the next publication version with one snapshot per available level |
| `POST workflow/unpublish`                 | ADMIN     | ends the active publication; PUBLISHED → APPROVED, other statuses preserved                      |
| `GET publications`                        | all three | version history, newest first, `limit`/`offset`                                                  |
| `GET publications/:version`               | all three | one version: times, actors, end reason, per-level hash and size                                  |
| `GET publications/:version/levels/:level` | all three | the stored snapshot of one level (admin view)                                                    |

`GET workflow` now also returns `activePublication`, and `allowedActions` includes `PUBLISH` / `UNPUBLISH` when they apply to the caller.

**Tables** (migration `CreateLessonPublications`):

- `lesson_publications`: version (unique per lesson), source `content_revision`, snapshot schema version, who/when published, and `ended_at/ended_by/ended_reason` (`SUPERSEDED` or `UNPUBLISHED`, all set together or all null). A partial unique index allows at most one active publication per lesson.
- `lesson_publication_levels`: one row per publication and level: the complete resolved lesson as `jsonb`, its SHA-256 over the canonical (sorted-key) JSON, and its size in UTF-8 bytes (1 to 5 MiB). A composite foreign key `(publication_id, lesson_id)` guarantees a snapshot belongs to a publication of the same lesson.
- `lesson_workflow_events.publication_id` links PUBLISH/UNPUBLISH events to their publication (required for those two actions, forbidden for the others).
- Database triggers enforce the lifecycle: a publication can only be ended, once, and is never reactivated or otherwise changed; snapshots can never be updated, deleted or truncated, nor added to an ended publication; publications are never deleted. All foreign keys are RESTRICT, so a lesson or admin with publication history cannot be deleted (lesson delete returns a controlled 409). The migration's `down()` destroys history once real publications exist: treat it as forward-only from then on.

**Publish** runs in the same transaction and under the same lesson lock as the review transitions: lock the lesson, check the expected revision and that the status is APPROVED, re-assemble the locked content and re-run the readiness rules (422 with the full report if anything is wrong, nothing written), resolve every available level independently (no cross-level fallback), measure each serialized snapshot against the 5 MiB limit, end the previous active publication as SUPERSEDED, allocate the next version, store the snapshots, move the status with a compare-and-set, and append the event. Any failure rolls everything back. Concurrent publishes and publish/edit races serialize on the lesson row lock: exactly one wins, an edit that commits first makes the publish a 409, and a publish that commits first snapshots a consistent pre-edit state (the later edit leaves the lesson a DRAFT while the old version keeps serving).

**Unpublish** ends the active publication, exactly once, in every working-copy state, and is refused (409, "no active publication") when there is none. It only changes the working copy's status in one case: PUBLISHED becomes APPROVED. A working copy that was edited after publishing keeps its status: DRAFT stays DRAFT, READY_FOR_REVIEW stays READY_FOR_REVIEW, APPROVED stays APPROVED, so the review of those edits can simply continue. When the status is preserved the lesson row is not written at all (not even `updated_at`); `lessons.version`, `content_revision`, the blocks and every snapshot are untouched in all four cases. The audit event records the status transition (`from_status = to_status` when preserved) and the ended publication. The events table's transition-shape CHECK was widened for this by migration `AllowUnpublishToPreserveStatus`.

**Not in this slice:** public Delivery APIs, course/module publishing, ARCHIVED. (The lock timeout and the consistency checks are in slice 3F-d below.)

## Publishing hardening (slice 3F-d)

**Lock timeout.** Every workflow transition (submit, request changes, approve, publish, unpublish) runs with a 10 second lock timeout. `TransactionRunner.run(work, { lockTimeoutMs })` sets it at the start of the transaction with `set_config('lock_timeout', …, true)`, which is `SET LOCAL`: it lasts only until that transaction commits or rolls back, so it cannot leak to the next user of a pooled connection (tests check that every pool connection reports no timeout afterwards). It applies to every lock the transition waits for, not only the lesson row: for example a publish that gets the lesson lock but then waits to supersede a publication row also gives up, and its whole transaction rolls back. The value is the `WORKFLOW_LOCK_TIMEOUT_MS` provider (10 000 ms), which tests override. Authoring transactions (lessons, blocks, curriculum, identity) are unchanged.

**Concurrency errors.** `TransactionRunner` translates a lock timeout (`55P03`), a deadlock (`40P01`) and a serialization failure (`40001`) into a `ConflictError`, which the global filter returns as HTTP 409 `CONFLICT` with `details: { reason: 'LOCK_TIMEOUT' | 'CONCURRENT_UPDATE', retryable: true }`. The message is generic; no SQL, table names, driver text or stack trace reach the client. The transaction has been rolled back, so for the authoring and workflow endpoints the same request can be sent again. This translation is the default for every `TransactionRunner.run` call; a call can turn it off with the `translateConcurrencyErrors: false` option, in which case the original error propagates unchanged, exactly as it did before the translation existed.

Exactly one call site opts out: `SessionService.rotate`, which backs `POST /api/v1/admin/auth/refresh`. A refresh is not "send the same request again": if a concurrent refresh has already rotated the token, presenting that token a second time is reuse, and reuse detection revokes the whole session. So a concurrency failure there is never reported as retryable. The opt-out changes error translation only; refresh-token rotation, reuse detection, the refresh cookie and session revocation behave exactly as before.

**Status and publication consistency.**

- Database rule (migration `AddPublishedLessonConsistency`): a lesson whose status is PUBLISHED has an active publication. It is a deferred constraint trigger, checked at commit, from both sides: when a lesson's status becomes PUBLISHED (or a lesson is inserted that way), and when a publication is inserted or ended. Being deferred, publish and unpublish can order their writes freely inside the transaction.
- Deliberately not constrained: a DRAFT, READY_FOR_REVIEW or APPROVED working copy may have an older publication that is still active. After an authoring edit the working copy returns to DRAFT (and may be re-reviewed and re-approved) while the published version keeps serving, until it is replaced or unpublished.
- Already enforced by earlier migrations: at most one active publication per lesson; a publication is ended once, never reactivated or changed; snapshots and workflow events are immutable; an event's publication belongs to the same lesson; every PUBLISH/UNPUBLISH event has a publication.
- Application check: `GET /api/v1/admin/publishing/consistency` (ADMIN only, read-only, never repairs) reports PUBLISHED lessons without an active publication, multiple active publications, publications without their PUBLISH event, PUBLISH events whose revision differs from the publication's source revision, UNPUBLISHED endings without an UNPUBLISH event, SUPERSEDED publications without a successor, publications without snapshots, and, with `?verifySnapshots=true`, snapshots whose stored hash or size no longer matches their content, or that exceed 5 MiB. `limit` (1 to 1000, default 100) caps issues per check and the report says when it was truncated. Re-hashing reads every snapshot, so it is opt-in.
- Not an inconsistency: a lesson's current status differing from its last event, because authoring edits reset the status without writing an event.

**Migration-only constraints.** The workflow-events transition-shape CHECK, the deferred consistency triggers and the append-only/immutability triggers exist only in migrations (the entities cannot express them), so `migration:drift` lists them (or their surrounding indexes and foreign keys) as differences. They are intentional and are not to be removed to quiet the drift report.

## Delivery: public lesson API (slice 4A)

The first learner-facing endpoint. The Delivery module owns no tables and no authoring knowledge: it serves what Publishing says is
currently published, through `PublishingFacade` only (the one thing `publishing/index.ts` exports for other modules). Anonymous: no learner
accounts, no login, no server-side progress.

```
GET /api/v1/lessons/:lessonId?level=BEGINNER
```

- `:lessonId` must be a UUID (otherwise 400 `BAD_REQUEST`). `level` is required and must be exactly `BEGINNER`, `INTERMEDIATE` or `ADVANCED`
  (otherwise 400 `VALIDATION_FAILED`: missing, empty, lower-case, repeated and unknown query parameters are all rejected).
- The route is `@Public()` (no authentication; any `Authorization` header sent is ignored), and rate limited (below).
- This is the only Delivery route. There is deliberately no listing, search, catalog, sync or download endpoint yet (a learner needs a lesson id
  from elsewhere until course/module publishing exists), and no write route.

**Response (200).** A fixed envelope around the stored snapshot:

```json
{
  "lessonId": "0b5c1c0e-…",
  "level": "BEGINNER",
  "publicationVersion": 3,
  "contentHash": "9f2b…(64 hex chars)",
  "snapshot": { "schemaVersion": 1, "level": "BEGINNER", "lesson": { … }, "blocks": [ … ] }
}
```

`snapshot` is the immutable payload stored when the lesson was published, passed through unchanged (its own `schemaVersion` and structure are
whatever was stored; it is never rebuilt from authoring data). `contentHash` is the stored SHA-256 of that payload's canonical serialization (JSON with
object keys sorted at every depth, array order kept), so a client can verify it. Note that PostgreSQL's `jsonb` does not keep key order, so a client
must sort keys before re-hashing; the body is not byte-identical to the canonical form. Nothing in the body depends on time or on the request, and nothing
administrative is included (no actors, workflow data, timestamps or internal publication ids).

**What is served.** Only the lesson's ACTIVE publication (`ended_at IS NULL`), and only the snapshot of exactly the requested level within it:

- No fallback to another level, an older version, a preview or the working copy. After an authoring edit the older publication stays active, so learners
  keep getting it until it is replaced or unpublished; once a lesson is unpublished the next request is a 404 (no waiting for a cache to expire).
- A draft, a lesson in review, an approved-but-unpublished lesson, a withdrawn lesson, a level the active publication does not have, and an id that does
  not exist all give the same answer: 404 `NOT_FOUND`, message `Lesson not found`, no details. Nothing distinguishes them.
- It reads the two publication tables only (`lesson_publications`, `lesson_publication_levels`), in two steps: first which publication/version/hash is
  active for the lesson and level, then the stored content of that exact publication and level, but only if it is still active at that moment
  (snapshots never change, so a publication ending between the steps is the only thing that can differ; the service then looks again, at most three times).
  A conditional request needs only the first step, so a 304 never reads a snapshot of up to 5 MiB.

**ETag and conditional requests.** Every 200 and 304 carries a strong, opaque ETag: the SHA-256 (hex) of one unambiguous serialization of the
representation's identity, e.g. `"3f6c…(64 hex chars)"`.

- **What it identifies.** The COMPLETE representation, i.e. the whole envelope, not just the snapshot payload. Every value that identifies it goes in
  explicitly: `lessonId`, `level`, `publicationVersion` and the stored `contentHash`. So a different lesson, a different level, a different version or
  different content always gets a different tag, even if some of the other values are identical (for example two lessons whose stored hash and
  publication version happen to be equal). Today the stored hash is computed over a payload that itself contains the lesson id and level, so such a
  coincidence cannot arise through the real publish path; the validator does not depend on that.
- **Construction** (`delivery/domain/etag.ts`): `sha256(JSON.stringify([scheme, lessonId, level, publicationVersion, contentHash]))`, where `scheme`
  is the fixed label `prophetic-destinations/lesson-snapshot-etag/2`. A JSON array quotes and escapes every string, so values cannot run into each
  other (joining them with a separator would let `("ab","c")` and `("a","bc")` collide). Nothing volatile goes in, so an identical representation always
  has the same tag. Republishing identical content as a new version changes the tag, because `publicationVersion` is in the envelope and must not be
  answered with 304. If the envelope or this construction ever changes, bump the scheme label so old tags stop matching. Clients must treat the tag as opaque.
- **`If-None-Match`** follows RFC 9110: weak comparison (`W/"x"` matches `"x"`), a comma-separated list matches if any member matches, `*` matches any
  current representation, and a malformed header is ignored (the full response is sent). A match returns `304 Not Modified` with no body and the same
  `ETag` and `Cache-Control`. A validator from another lesson, level or version, or for a withdrawn publication, never matches; a withdrawn or
  unpublished lesson is a 404 whatever validator the client sends.
- Error responses carry no snapshot validator. (Express adds its own weak ETag to JSON bodies; on an error that tag is meaningless, the response is `no-store`,
  and a conditional request on an error is never answered with 304.)

**Cache policy.** `Cache-Control: public, no-cache` on 200 and 304; `Cache-Control: no-store` on every error (400, 404, 429, 500). `no-cache` lets a
browser or shared cache keep a copy but forces it to revalidate with the ETag before reusing it, so a withdrawn lesson stops being served on the very
next request while an unchanged one costs only a bodiless 304. There is no `max-age`, `s-maxage`, `immutable` or `stale-*` on purpose, and no
`Last-Modified`/`Expires`. A client that ignores these headers is outside the server's control. No CDN or external cache is part of this phase; if one
is added later it must honour `no-cache` revalidation (or purge on unpublish) to keep withdrawal immediate.

**Rate limit.** The route has its own limiter, separate from login/refresh (their counters do not affect each other), applied by an explicit
`ThrottlerGuard` on the controller, per client address. Defaults: 120 requests per 60 seconds, configurable with `PUBLIC_RATE_LIMIT` and
`PUBLIC_RATE_WINDOW_SECONDS`. Every request counts, whatever its outcome (200, 304, 400, 404), because the limiter runs before the route does any work.
Over the limit: `429` with the standard error body (`code: TOO_MANY_REQUESTS`) and a `Retry-After` header. The key is the client address as Express
reports it (`req.ip`; IPv6 addresses are grouped by their /64 prefix). Many users behind one carrier or office NAT share an address, which is why the
default is generous. Read the next section before deploying.

**Deployment behind a reverse proxy.** The limiter is only as good as the client address it sees. Express `trust proxy` is deliberately NOT enabled (a test
asserts it), so today `req.ip` is the address of the TCP peer and the forwarded-address headers a client sends (`X-Forwarded-For`, `Forwarded`,
`X-Real-IP`, ...) are ignored. A test asserts that inventing those headers does not evade the limit.

- **Why client-supplied forwarded headers must not be trusted.** Any client can send any value. Trusting them would let a caller pick its own limiter key
  (rotate it to dodge the limit entirely) or claim someone else's address to use up that person's allowance, and would poison any log that records the
  address. `trust proxy` must therefore never be switched on blindly (`true` trusts every hop, including the client).
- **What happens behind a proxy if nothing is done.** The TCP peer is then the proxy, so every learner shares one limiter bucket and the default of 120 per
  minute would throttle all of them together. The same setting also affects the login/refresh limiter.
- **What to do before going live behind a proxy or load balancer.** Configure `trust proxy` explicitly with the real proxy: its exact address or network
  (or an exact number of hops), never `true`. Nothing is hard-coded or configurable for this yet because the deployment is not known; it is a one-line change
  in `configureApp` once it is. The proxy must itself sanitize the headers: overwrite (not append to) `X-Forwarded-For` with the address it actually saw, and
  drop client-supplied `Forwarded` and `X-Real-IP`. The backend should accept connections only from the proxy, so nobody can reach it directly and send
  forged headers.
- **In-memory counters.** Limits are kept in each process's memory: they reset when the process restarts or redeploys, and each instance counts
  separately, so with several instances the effective limit is up to the per-instance limit times the number of instances (depending on how requests
  are balanced). If a consistent global limit is needed, a shared rate-limit store must be introduced (for example Redis). That is not part of this
  phase, and no such infrastructure is included.

**Boundaries.** Delivery imports only `publishing/index.js`; it never touches lessons, curriculum, identity or any entity or repository (enforced by
`test/architecture.spec.ts` and `delivery-boundaries.spec.ts`). Publishing's admin endpoints, workflow, snapshot format and transactions are unchanged.
Not in this phase: course/module publishing or a catalog, Scripture, Media, Quizzes, further block contracts, reusable blocks, learner identity or progress.

## HTTP conventions

- All routes are under `/api/v1`, except `GET /health` and `GET /health/db`.
- Every request has an `x-request-id` (generated if absent) that is echoed in the response and in error bodies.
- Errors always look like `{ statusCode, code, message, details?, requestId }`.
  Throw a `DomainError` subclass (`NotFoundError`, `ConflictError`, `BusinessRuleError`, `UnauthorizedError`, `ForbiddenError`) from business code;
  the global filter maps them to 404 / 409 / 422 / 401 / 403. Unexpected errors become a generic 500.
- Request bodies are validated by a global `ValidationPipe` (whitelist, reject unknown fields, transform).
  Validation failures return `code: VALIDATION_FAILED` with per-field `details`.

## Database

- `synchronize` is off. Schema changes are migrations only, in `src/database/migrations`.
- Each module registers its entities with `TypeOrmModule.forFeature`; `autoLoadEntities` picks them up.
- Multi-write use cases run through `TransactionRunner.run(manager => ...)` and pass `manager` explicitly to repositories.
- Migration commands (each builds first): `npm run migration:show | migration:run | migration:revert`.
  Scaffold one with `npm run migration:create -- src/database/migrations/<Name>`, then write the SQL by hand and inspect it before running.
- `npm run migration:drift` prints what TypeORM thinks differs between entities and the database. Expect two known false
  positives: it re-sets the `gen_random_uuid()` id defaults, re-creates foreign keys and the `idx_courses_created_at_id` index, and proposes dropping `lessons.module_id`'s foreign key and the composite foreign keys of `lesson_block_levels` (it targets another module's table, so it is intentionally not modelled in the entity). Triggers such as `trg_lesson_blocks_type_immutable` are not modelled in entities either. Anything else is real drift.

## Testing

- `npm test` unit tests, colocated as `*.spec.ts`, plus the architecture rules.
- `npm run test:int` repository tests against the real database (`*.int-spec.ts`, next to the code they test).
- `npm run test:e2e` boots the real app against a real database.
- Integration and e2e tests run against the database in `DATABASE_URL` (currently the development database; there is no separate test branch yet). They create their own rows (emails ending in `@int-test.invalid` / `@e2e-test.invalid`) and delete them afterwards.
