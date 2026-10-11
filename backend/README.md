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

### Demo admin login (local only)

There is no special demo login and no hardcoded credential: the demo uses the normal admin account and the normal login endpoint. You choose the email and
password in your own, untracked `.env` (`.env` is in `.gitignore`; `.env.example` holds placeholders only):

```bash
# in backend/.env
SEED_ADMIN_EMAIL=<an email you choose>
SEED_ADMIN_PASSWORD=<a password you choose, at least 12 characters>
```

```bash
npm run seed:admin    # creates that ADMIN if it does not exist
```

- `seed:admin` is safe to re-run: if the account already exists it changes **nothing, including the password**. If you change `SEED_ADMIN_PASSWORD` later
  and re-run it, the account keeps its old password; change it through the account-management API instead (`POST /admin/auth/password`, or an ADMIN's
  `POST /admin/accounts/:id/password-reset`).
- The account is a real ADMIN: the password is hashed with argon2, login is rate limited, roles and account status are enforced, and nothing is logged
  (neither the password, nor tokens). Sign in at `POST /api/v1/admin/auth/login` with the same email and password; the Admin Website uses that endpoint too.
- For anything other than a local demo, use a strong password that is not shared, and keep it out of the repository, tickets and chat.

### Demo content

With the server running (`npm run start:dev`) and the ADMIN seeded:

```bash
npm run seed:demo      # or, seeding the admin first as well: npm run demo:setup
```

It signs in through the API and creates one clearly synthetic course (`[DEMO] …`, two modules, three lessons, placeholder text that says it is not
Scripture), takes every lesson, module and the course through submit → approve → publish, and prints the public URLs. Re-running it changes nothing.
`DEMO_API_URL` overrides the default `http://localhost:3001/api/v1`.

`seed:demo` publishes synthetic content into the catalog of whatever server it points at, so it refuses to run when `NODE_ENV=production`, or when
`DEMO_API_URL` is not on this machine, unless you set `DEMO_ALLOW_PRODUCTION=true` / `DEMO_ALLOW_REMOTE=true` on purpose. If sign-in fails it says why
(account missing, server not running, rate limited, or the account must change its password first) without printing any credential.

A suggested walkthrough:

1. Sign in: `POST /api/v1/admin/auth/login` with the ADMIN email and password; use the `accessToken` as `Authorization: Bearer …`.
2. Browse the authored content: `GET /api/v1/admin/courses`, then the course, its modules, lessons and `…/workflow` state.
3. See the immutable publications: `GET /api/v1/admin/lessons/:lessonId/publications/1/levels/BEGINNER` and `GET /api/v1/admin/courses/:courseId/publications`.
4. As a learner (no token): `GET /api/v1/courses?level=BEGINNER`, the course, a lesson, and `…/navigation` for previous/next.
5. Revalidate: repeat a public request with `If-None-Match: <ETag>` and get `304`.
6. Unpublish the course (`POST …/workflow/unpublish`) and see the same public requests return `404`, even with the old ETag; publish it again to restore it.

## Media storage (local)

Uploaded media lives on the local filesystem during development, behind a storage interface so deployment can use object storage instead.

- `MEDIA_STORAGE_ROOT` (default `./storage/media`), `MEDIA_MAX_BYTES` (default 5 MiB) and `MEDIA_ALLOWED_TYPES` (default `image/png,image/jpeg,image/webp`)
  are set in `.env`; see `.env.example`. `/storage/` is git-ignored, so uploads are never committed.
- Back up the storage directory together with the database (the database lists the assets, the directory holds the bytes). Deleting an asset through the API
  removes both; deleting the directory by hand leaves rows that answer 404 on `content`.
- The library is admin-only (`/api/v1/admin/media`, see [docs/api-reference.md](docs/api-reference.md)); nothing is served to the public.

## Scripts

| Script                                            | Purpose                                                          |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| `npm run build` / `npm run lint`                  | production build / lint                                          |
| `npm run migration:show` / `run` / `revert`       | migration status / apply / revert the last                       |
| `npm run seed:admin` / `seed:demo` / `demo:setup` | first ADMIN / synthetic demo course                              |
| `npm test`                                        | unit tests and the architecture test                             |
| `npm run test:int` / `npm run test:e2e`           | integration / end-to-end tests (they use the database in `.env`) |

The integration and end-to-end tests create their own rows and clean them up, but they run against the database in `DATABASE_URL`, so point that at a
development database.

## What is and is not implemented

Implemented: admin authentication and roles, a local-storage media library for admins, and admin account management (temporary passwords, role changes, disable/enable, forced resets, audit trail); courses, modules and lessons; `RICH_TEXT` blocks with per-level variants; the review, approval and publishing
workflow for lessons, modules and courses; immutable lesson and catalog snapshots; the public catalog, lesson and navigation API with ETags.

Not implemented (waiting on specifications or decisions): Scripture/KJV data and its two block types, public media delivery, Quizzes, the other block contracts, learner accounts and progress.
