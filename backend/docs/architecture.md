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

| Module | Owns | May import |
|---|---|---|
| identity | admin accounts, roles, auth, guards | none |
| curriculum | courses and **modules** (product term; keep it in code and UI) | identity |
| lessons | lessons, blocks, level variants, level availability, level resolution, preview | identity, curriculum, scripture, media, quizzes |
| scripture | structured Scripture references | identity |
| media | media library and storage adapter | identity |
| quizzes | quizzes, questions, options | identity |
| publishing | workflow transitions, audit events, published snapshots | identity, lessons, curriculum |
| delivery | learner read API (no tables) | publishing |
| health | liveness and DB readiness | none |

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
  scoped to `/api/v1/admin/auth`. Tokens from one login form a *family* (the session); replaying a rotated token revokes the family.
- Login and refresh are rate limited per IP (`AUTH_RATE_LIMIT` per `AUTH_RATE_WINDOW_SECONDS`).

| Endpoint | Auth |
|---|---|
| `POST /api/v1/admin/auth/login` | public, throttled |
| `POST /api/v1/admin/auth/refresh` | public (refresh cookie), throttled |
| `POST /api/v1/admin/auth/logout` | public (refresh cookie); always 204 |
| `GET  /api/v1/admin/auth/me` | any authenticated admin |

## Curriculum (courses and modules)

**Owns:** the `courses` and `course_modules` tables, and the Course and Module (product term, never "unit") rules.
**Does not own:** lessons, blocks, quizzes, scripture, media or publishing.
**Depends on:** identity only (`Role`/`Roles`). Lessons depend on curriculum through `CurriculumFacade` (exported from `index.ts`: `findModule`,
`lockModule`), which exposes only a module's id and course id. Entities are never exported. Curriculum never imports lessons: deleting a
module that still has lessons is refused by the `ON DELETE RESTRICT` foreign key, translated to a 409.

API (all authenticated, all under `/api/v1/admin`):

| Endpoint | Roles |
|---|---|
| `GET /courses`, `GET /courses/:courseId` | ADMIN, EDITOR, REVIEWER |
| `POST /courses`, `PATCH /courses/:courseId` | ADMIN, EDITOR |
| `DELETE /courses/:courseId` | ADMIN |
| `GET /courses/:courseId/modules`, `GET .../modules/:moduleId` | ADMIN, EDITOR, REVIEWER |
| `POST /courses/:courseId/modules`, `PATCH .../modules/:moduleId`, `DELETE .../modules/:moduleId` | ADMIN, EDITOR |
| `PUT /courses/:courseId/modules/order` (body `{ moduleIds: [...] }`) | ADMIN, EDITOR |

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

| Endpoint | Roles |
|---|---|
| `GET /courses/:courseId/modules/:moduleId/lessons`, `GET /lessons/:lessonId` | ADMIN, EDITOR, REVIEWER |
| `POST /courses/:courseId/modules/:moduleId/lessons`, `PUT .../lessons/order` | ADMIN, EDITOR |
| `PATCH /lessons/:lessonId`, `PUT /lessons/:lessonId/levels` | ADMIN, EDITOR |
| `DELETE /lessons/:lessonId` | ADMIN, EDITOR |

Role decision: the guide defines CMS actions but no lesson/block role matrix, so lessons follow the approved curriculum model exactly:
read for all three roles, write for ADMIN and EDITOR, and deleting a lesson is allowed to the same roles that may delete a Module (ADMIN and
EDITOR). Only deleting a Course is ADMIN-only. `status` cannot be set through the API; editing a lesson (including its levels) puts it back
to `DRAFT`. Lessons with blocks cannot be deleted once blocks exist (3E-b); published-lesson deletion is a Publishing decision.

## Lesson blocks (slice 3E-b)

**Owns:** `lesson_blocks` (and the trigger that keeps a block's type immutable). Block level visibility/variants (`lesson_block_levels`), the
level-aware resolver, preview and reusable (linked) blocks are not built yet.

- A block is a *placement* in a lesson: stable uuid `id`, immutable `type`, explicit `position` (1..n, `UNIQUE (lesson_id, position) DEFERRABLE`),
  `shared_content jsonb` (nullable = no content yet), its own `version`. The FK to `lessons` is `ON DELETE RESTRICT`.
- **BlockTypeRegistry** (`lessons/domain/blocks/registry.ts`) is the application source of truth. The 19 identifiers from the guide are listed in
  `block-types.ts` and in a database CHECK (a backstop; adding an implemented type needs no migration). The registry decides which types are
  *usable*: today **RICH_TEXT only**; any other defined type gets 422 "not available yet", an identifier outside the guide gets 400. Each
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
  positives: it re-sets the `gen_random_uuid()` id defaults, re-creates foreign keys and the `idx_courses_created_at_id` index, and proposes dropping `lessons.module_id`'s foreign key (it targets another module's table, so it is intentionally not modelled in the entity). Triggers such as `trg_lesson_blocks_type_immutable` are not modelled in entities either. Anything else is real drift.

## Testing

- `npm test` unit tests, colocated as `*.spec.ts`, plus the architecture rules.
- `npm run test:int` repository tests against the real database (`*.int-spec.ts`, next to the code they test).
- `npm run test:e2e` boots the real app against a real database.
- Integration and e2e tests run against the database in `DATABASE_URL` (currently the development database; there is no separate test branch yet). They create their own rows (emails ending in `@int-test.invalid` / `@e2e-test.invalid`) and delete them afterwards.

