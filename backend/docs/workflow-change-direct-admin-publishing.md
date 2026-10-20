# Workflow change: direct publishing by ADMIN

**Status:** approved project direction, changes the original requirements (the Draft -> Submit -> Approve -> Publish chain for every publisher).

## Decision
- **ADMIN** publishes a lesson, a module or a course directly from Draft (also from Waiting for review or Approved). No submit or approve step is needed.
- **EDITOR** and **REVIEWER** keep the review workflow and their permissions unchanged. Only ADMIN may publish or unpublish (unchanged).
- The review and approval machinery (submit, request changes, approve, their events and endpoints) is kept for future use. ADMIN may still use them. No Super Admin role was added.

## What did not change
- Readiness checks, required-content validation, Scripture and quiz version checks, snapshots (immutable) and concurrency protection. Publishing is still one transaction that locks the item, compares the expected revision/version (409 if it moved), re-validates the locked content, writes the snapshots and the event.
- The exact working revision validated inside the transaction is the one published (`assembleForPublication` re-checks the revision under the lock).
- Editing published content still creates working changes (status returns to Draft); learners keep seeing the published version until the next publish.
- Lesson publication and course catalog inclusion remain separate operations. Publishing a course does not publish its Draft modules or lessons; publishing a module requires a published course.

## Audit history
A direct publish records one `PUBLISH` event with `from_status` = the status the item really left (`DRAFT`, ...) and `to_status` = `PUBLISHED`, the admin as actor. No `SUBMIT_FOR_REVIEW`/`APPROVE` event is invented. Course publication still records its own events for modules it moves from Approved to Published.

## Code
- `publishing/domain/workflow.ts` (`planTransition`, `directPublish`), `catalog-transition.ts`, `roles.ts` (`canPublishDirectly`); `workflow.service.ts` and `catalog-workflow.service.ts` pass `actor.role`; `allowedActions` in the workflow state reflect it per role.
- **Schema:** migration `1791840000000-AllowDirectAdminPublish` widens the transition-shape CHECK of `lesson_workflow_events` and `catalog_workflow_events` so a PUBLISH event may start from Draft / Waiting for review. This was unavoidable: the old CHECK only allowed PUBLISH from Approved. No table, column or row changes. It must be run before direct publishing works. `down()` fails once such events exist (history is never rewritten).
- Admin website: `lib/review-guidance.ts` (`visibleActions`, labels "Publish" / "Publish changes"), `ReviewPublishPanel`, and the lesson, course and module pages.
