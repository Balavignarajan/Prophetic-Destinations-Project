# Prophetic Destinations — backend

NestJS + TypeScript + PostgreSQL (TypeORM, migrations only). A modular monolith: identity, curriculum, lessons, publishing, delivery (public API), and
Scripture reference parsing (no Bible text), and placeholder shells for media and quizzes.

- Architecture and rules: [docs/architecture.md](docs/architecture.md)
- Route index and quick contracts: [docs/api-reference.md](docs/api-reference.md)
- Scripture source/licensing status: [docs/scripture-source-research.md](docs/scripture-source-research.md) (unresolved; no Bible text is bundled)

## Setup

Prerequisites: Node.js 22+, a PostgreSQL database (the project uses Neon; use the pooled connection string).

```bash
npm install
cp .env.example .env     # then fill in the values below
npm run migration:run    # applies all migrations (they build first)
npm run seed:admin       # creates the first ADMIN from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
npm run start:dev        # http://localhost:3001 (set PORT to change)
```

Required in `.env`: `DATABASE_URL`, `JWT_ACCESS_SECRET` (at least 32 random characters). For `seed:admin`: `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`
(at least 12 characters). Optional settings (ports, token lifetimes, rate limits, CORS) are listed in `.env.example`. Never commit real values.

Check it is up: `GET /health` and `GET /health/db`.

## Demo

With the server running and an ADMIN account seeded:

```bash
npm run seed:demo
```

It signs in through the API and creates one clearly synthetic course (`[DEMO] …`, two modules, three lessons, placeholder text that says it is not
Scripture), takes every lesson, module and the course through submit → approve → publish, and prints the public URLs. Re-running it changes nothing.
`DEMO_API_URL` overrides the default `http://localhost:3001/api/v1`.

A suggested walkthrough:

1. Sign in: `POST /api/v1/admin/auth/login` with the ADMIN email and password; use the `accessToken` as `Authorization: Bearer …`.
2. Browse the authored content: `GET /api/v1/admin/courses`, then the course, its modules, lessons and `…/workflow` state.
3. See the immutable publications: `GET /api/v1/admin/lessons/:lessonId/publications/1/levels/BEGINNER` and `GET /api/v1/admin/courses/:courseId/publications`.
4. As a learner (no token): `GET /api/v1/courses?level=BEGINNER`, the course, a lesson, and `…/navigation` for previous/next.
5. Revalidate: repeat a public request with `If-None-Match: <ETag>` and get `304`.
6. Unpublish the course (`POST …/workflow/unpublish`) and see the same public requests return `404`, even with the old ETag; publish it again to restore it.

## Scripts

| Script                                      | Purpose                                                          |
| ------------------------------------------- | ---------------------------------------------------------------- |
| `npm run build` / `npm run lint`            | production build / lint                                          |
| `npm run migration:show` / `run` / `revert` | migration status / apply / revert the last                       |
| `npm run seed:admin` / `npm run seed:demo`  | first ADMIN / synthetic demo course                              |
| `npm test`                                  | unit tests and the architecture test                             |
| `npm run test:int` / `npm run test:e2e`     | integration / end-to-end tests (they use the database in `.env`) |

The integration and end-to-end tests create their own rows and clean them up, but they run against the database in `DATABASE_URL`, so point that at a
development database.

## What is and is not implemented

Implemented: admin authentication and roles; courses, modules and lessons; `RICH_TEXT` blocks with per-level variants; the review, approval and publishing
workflow for lessons, modules and courses; immutable lesson and catalog snapshots; the public catalog, lesson and navigation API with ETags.

Not implemented (waiting on specifications or decisions): Scripture/KJV data and its two block types, Media, Quizzes, the other block contracts, admin
account management, learner accounts and progress.
