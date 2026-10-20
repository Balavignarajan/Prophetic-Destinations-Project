# Placement assessment (backend)

An optional questionnaire the mobile app shows during onboarding (and on a retake) that **recommends** one of `BEGINNER`, `INTERMEDIATE`, `ADVANCED`. The learner is never locked to the result. Nothing about a learner is stored: no account, no answers, no results (the app keeps the chosen level and result on the device). It is a separate domain from lesson quizzes (own tables, own rules).

## What is decided and what is not
The requirements do **not** define the questions, the scoring formula or any thresholds. So no rule is hardcoded as approved:
- each answer option carries the **points it gives to each level** (`scores`, set by staff);
- each assessment carries a **scoring configuration** that staff must set before it can be published;
- the one strategy implemented, `LEVEL_POINTS`, is **provisional and replaceable** behind `scoringConfig.strategy` without changing the mobile contract (answers in; level, totals out).

`LEVEL_POINTS`: total each level's points over the chosen options; the recommended level is the one with the highest total. If several levels share the highest total (all zero included), `tieBreak` (`LOWER_LEVEL` | `HIGHER_LEVEL`, chosen by staff) picks the lowest or highest of them. `requireAllQuestions` (chosen by staff) says whether every question must be answered. Optional `resultMessages` hold staff-written plain text per level; nothing is generated.

## Lifecycle and versions
Same workflow as lessons: `DRAFT → READY_FOR_REVIEW → APPROVED → PUBLISHED`. EDITOR submits; REVIEWER approves or requests changes; ADMIN may do all of it and alone publishes/unpublishes. **An assessment can be published only from `APPROVED`, for every role including ADMIN.** The direct-publishing rule in `workflow-change-direct-admin-publishing.md` is documented for lessons, modules and courses only and is deliberately not extended to assessments (an ADMIN approves first, so the audit trail always shows the approval; the database CHECK on `assessment_workflow_events` enforces `PUBLISH` from `APPROVED` only). Editing returns an assessment to `DRAFT`, so a changed assessment must be approved again before it is republished. There is no archive (nothing in the project has one): withdrawing is *unpublish*.
- The **working copy** (`assessments`, `assessment_questions`, `assessment_options`) is what staff edit. Any edit returns it to DRAFT and bumps `version` (the concurrency token). It never affects what learners get.
- **Publishing** validates the saved working copy again inside the transaction, freezes it (including the exact scoring configuration and every option's points) as an immutable row in `assessment_publications` (`version` 1, 2, ... per assessment) and makes it the **active** publication. **One active assessment at a time** (initial policy; nothing in the requirements contradicts it): a partial unique index allows at most one active publication in the whole system. Publishing therefore *replaces* the active one **atomically**: in ONE transaction the previous publication is ended (`SUPERSEDED`), the new one is inserted, the status of the new assessment becomes `PUBLISHED`, and, if the replaced publication belonged to ANOTHER assessment, that assessment goes `PUBLISHED → APPROVED` with its own `UNPUBLISH` audit event (note: "Withdrawn because another assessment was published"). Publish/unpublish serialize on one advisory lock, and deferred triggers guarantee at commit that a `PUBLISHED` assessment always has an active publication. If anything fails, nothing changes and the previous assessment stays active.
- Old publications are kept forever (the database refuses to change or delete them): a client that rendered version 1 can still be scored against version 1.
- Every workflow action is recorded in the append-only `assessment_workflow_events`.

## Publishing requirements (blocking) and warnings
Blocking: a valid scoring configuration; at least one question; every question has 2 to 6 options; no two answers of a question have the same text; every answer has whole-number points (0 to 100) for ALL THREE levels. Warnings (never blocking, for the owner's judgement): a question whose answers give no points / identical points, a level that no answer gives points to (only reachable via the tie-break).

## Admin API (`/api/v1/admin/assessments`, all responses `no-store`)
| Method and path | Roles | Purpose |
|---|---|---|
| `POST /` | ADMIN, EDITOR | create a DRAFT from the complete content |
| `GET /?status=&limit=&offset=` | all staff | list with status, version, questionCount, scoringConfigured, activePublishedVersion, latestPublishedVersion |
| `GET /:id` | all staff | detail: questions, options with `scores`, `scoringConfig`, activePublication, `allowedActions` |
| `PUT /:id` | ADMIN, EDITOR | replace the working copy (send `version`; ids that are sent are kept); returns it to DRAFT |
| `PUT /:id/questions/order` | ADMIN, EDITOR | `{questionIds, previousQuestionIds?, version?}` |
| `PUT /:id/questions/:questionId/options/order` | ADMIN, EDITOR | `{optionIds, previousOptionIds?, version?}` |
| `GET /:id/validation` | all staff | `{valid, problems[], warnings[]}` for the saved copy |
| `GET /:id/publications` | all staff | published versions, newest first |
| `GET /:id/workflow/events` | all staff | audit trail, newest first |
| `POST /:id/workflow/submit` | ADMIN, EDITOR | DRAFT → READY_FOR_REVIEW |
| `POST /:id/workflow/request-changes` | ADMIN, REVIEWER | READY_FOR_REVIEW → DRAFT (`note` required) |
| `POST /:id/workflow/approve` | ADMIN, REVIEWER | READY_FOR_REVIEW → APPROVED |
| `POST /:id/workflow/publish` | ADMIN | **only from `APPROVED`**: validate, freeze, make active (`{note?, expectedVersion?}`); 409 from any other status |
| `POST /:id/workflow/unpublish` | ADMIN | end the active publication |

## Scoring contract (for the Admin Website)
`scoringConfig` (null/absent = not configured: the draft can be saved but not published). Exactly these keys; any other key is rejected with `SCORING_KEY_UNSUPPORTED`:

| key | type | meaning |
|---|---|---|
| `strategy` | `"LEVEL_POINTS"` (the only value) | how answers become a level (provisional, replaceable) |
| `tieBreak` | `"LOWER_LEVEL"` or `"HIGHER_LEVEL"` | which of the tied levels is recommended when several share the highest total, all zeros included |
| `requireAllQuestions` | boolean | `true`: every question must be answered; `false`: any non-empty subset |
| `resultMessages` | optional `{ BEGINNER?, INTERMEDIATE?, ADVANCED? }`, plain text, each at most 500 characters | shown with the result for that level; never generated |

Each option: `scores` is **required** and must contain **all three** of `BEGINNER`, `INTERMEDIATE`, `ADVANCED`, each a whole number 0 to 100 (no other keys). Recommendation = the level with the largest sum of `scores` over the chosen options; ties are resolved by `tieBreak`. Question and option ids sent with a save must belong to THIS assessment (an option to its own question), otherwise the save is refused with `UNKNOWN_ID`; omit `id` for new items. The published snapshot stores the configuration and the points exactly as scored, so a later edit never changes how an earlier version scores.

Save-time errors (422, `details.problems[]` with `code`, `message`, `path`): `TITLE_REQUIRED`, `TITLE_TOO_LONG`, `DESCRIPTION_TOO_LONG`, `TOO_MANY_QUESTIONS`, `PROMPT_REQUIRED`, `PROMPT_TOO_LONG`, `TOO_MANY_OPTIONS`, `OPTION_TEXT_REQUIRED`, `OPTION_TEXT_TOO_LONG`, `DUPLICATE_ID`, `SCORES_REQUIRED`, `SCORE_MISSING`, `POINTS_INVALID`, `UNKNOWN_LEVEL`, `SCORING_INVALID`, `SCORING_STRATEGY_INVALID`, `SCORING_TIE_BREAK_INVALID`, `SCORING_REQUIRE_ALL_INVALID`, `SCORING_MESSAGES_INVALID`, `SCORING_MESSAGE_INVALID`, `SCORING_KEY_UNSUPPORTED`; `UNKNOWN_ID` for ids that do not belong. Publish-time blocking (`details.report.problems[]`): `SCORING_NOT_CONFIGURED` (plus the scoring codes), `NO_QUESTIONS`, `TOO_FEW_OPTIONS`, `DUPLICATE_OPTION_TEXT`, `POINTS_INVALID`. Warnings (never blocking): `QUESTION_HAS_NO_POINTS`, `QUESTION_NOT_DISCRIMINATING`, `LEVEL_UNREACHABLE`.

Save body (`POST`, `PUT`):
```json
{
  "title": "Find your starting level",
  "description": "Answer a few questions...",
  "scoringConfig": { "strategy": "LEVEL_POINTS", "tieBreak": "LOWER_LEVEL", "requireAllQuestions": true,
                     "resultMessages": { "BEGINNER": "..." } },
  "questions": [
    { "id": "<existing id, omit when new>", "type": "SINGLE_CHOICE", "prompt": "...",
      "options": [ { "id": "<optional>", "text": "...", "scores": { "BEGINNER": 2, "INTERMEDIATE": 0, "ADVANCED": 0 } } ] }
  ],
  "version": 3
}
```
Errors: 401/403 auth; 404 unknown id; 409 stale `version`/order or a transition that does not fit the status (`details` has the current state); 422 invalid content (`details.problems[]`) or a publish that fails validation (`details.report`).

## Public API (anonymous, rate limited, `no-store`)
`GET /api/v1/assessments/active` →
```json
{ "assessmentId": "uuid", "version": 2, "title": "...", "instructions": "...|null", "requireAllQuestions": true,
  "questions": [ { "id": "uuid", "position": 1, "type": "SINGLE_CHOICE", "prompt": "...",
                   "options": [ { "id": "uuid", "position": 1, "text": "..." } ] } ] }
```
No points, no scoring configuration, no status. **404** `{ code: "NOT_FOUND", details: { reason: "ASSESSMENT_UNAVAILABLE" } }` when nothing is published.

`POST /api/v1/assessments/:assessmentId/submissions` with `{ "version": 2, "answers": [ { "questionId": "uuid", "optionId": "uuid" } ] }` →
```json
{ "assessmentId": "uuid", "version": 2, "recommendedLevel": "INTERMEDIATE",
  "scores": { "BEGINNER": 3, "INTERMEDIATE": 7, "ADVANCED": 4 }, "tiedLevels": ["INTERMEDIATE"],
  "answered": 8, "total": 8, "message": "staff-written text or null",
  "current": true, "activePublication": { "assessmentId": "uuid", "version": 2 } }
```
The answers are scored against the **exact version named in the request** (the stored snapshot, active or since replaced). **Reading `current`:** the result is always correct for `assessmentId` + `version`. `current: true` means that version is still the active one. `current: false` means it was replaced or withdrawn since the client rendered it: the recommendation remains valid advice (a learner is never locked to a level), so the app may keep it and MAY offer a retake; `activePublication` tells it what a retake would use (`null` = nothing is published now). `scores` are the level totals and `tiedLevels` the levels that shared the top total; neither exposes the scoring configuration or any option's points. Errors: 404 `details.reason = "ASSESSMENT_VERSION_NOT_FOUND"`; 422 with `details.code`: `INVALID_ANSWER` (a question or option that is not in that version, including ids of another assessment), `DUPLICATE_ANSWER` (a question answered twice), `NO_ANSWERS` (empty list), `MISSING_ANSWERS` (when `requireAllQuestions`); 400 only for a malformed body (not a UUID, wrong type, missing field); 429 rate limit. The client never sends a level, a score or points.

## Schema (migration `1791860000000-CreateAssessments`)
`assessments`, `assessment_questions`, `assessment_options` (working copy; stable ids; positions unique per parent, deferrable), `assessment_publications` (immutable snapshots; one active), `assessment_workflow_events` (append-only). Adds tables only. Persistence is raw SQL like quizzes and publications (no TypeORM entities).
