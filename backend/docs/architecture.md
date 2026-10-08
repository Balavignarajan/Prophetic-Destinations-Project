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
**Does not own:** lessons, blocks, quizzes, scripture, media or publishing. Lessons will reference a module by id later.
**Depends on:** identity only (`Role`/`Roles`). Nothing depends on curriculum yet; when lessons need to check a module exists,
curriculum will export a small facade from its `index.ts` (entities are never exported).

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
  positives: it re-sets the `gen_random_uuid()` id defaults and re-creates foreign keys (`admin_refresh_tokens`, `course_modules`) and the `idx_courses_created_at_id` index. Anything else is real drift.

## Testing

- `npm test` unit tests, colocated as `*.spec.ts`, plus the architecture rules.
- `npm run test:int` repository tests against the real database (`*.int-spec.ts`, next to the code they test).
- `npm run test:e2e` boots the real app against a real database.
- Integration and e2e tests run against the database in `DATABASE_URL` (currently the development database; there is no separate test branch yet). They create their own rows (emails ending in `@int-test.invalid` / `@e2e-test.invalid`) and delete them afterwards.

