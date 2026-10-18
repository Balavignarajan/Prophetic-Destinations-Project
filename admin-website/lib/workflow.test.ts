// Run with: npm test  (Node's built-in test runner, no extra dependency)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { WORKFLOW_ENDPOINT, catalogTransitionBody, lessonTransitionBody, type WorkflowAction } from './workflow.ts';

const ACTIONS: WorkflowAction[] = ['SUBMIT_FOR_REVIEW', 'REQUEST_CHANGES', 'APPROVE', 'PUBLISH', 'UNPUBLISH'];

// The properties the backend DTOs accept (backend/src/modules/publishing/api/dto/workflow.dto.ts and catalog.dto.ts).
// The global ValidationPipe uses forbidNonWhitelisted, so ANY other property is a 400.
const LESSON_ALLOWED = ['note', 'expectedContentRevision'];
const CATALOG_ALLOWED = ['note', 'expectedVersion'];

describe('workflow endpoints', () => {
  it('maps every action to the backend route segment', () => {
    assert.deepEqual(WORKFLOW_ENDPOINT, {
      SUBMIT_FOR_REVIEW: 'submit',
      REQUEST_CHANGES: 'request-changes',
      APPROVE: 'approve',
      PUBLISH: 'publish',
      UNPUBLISH: 'unpublish',
    });
  });
});

describe('lesson transitions (TransitionDto / RequestChangesDto)', () => {
  for (const action of ACTIONS) {
    it(`${action}: sends only properties the backend accepts, never "version"`, () => {
      const body = lessonTransitionBody(action, { contentRevision: 7 }, '  please fix  ');
      for (const key of Object.keys(body)) assert.ok(LESSON_ALLOWED.includes(key), `unexpected property ${key}`);
      assert.equal('version' in body, false);
      assert.equal(body.expectedContentRevision, 7);
    });
  }

  it('REQUEST_CHANGES carries the trimmed note (mandatory in the backend)', () => {
    assert.deepEqual(lessonTransitionBody('REQUEST_CHANGES', { contentRevision: 3 }, '  Needs sources \n'), { note: 'Needs sources', expectedContentRevision: 3 });
  });

  for (const action of ['SUBMIT_FOR_REVIEW', 'APPROVE', 'PUBLISH', 'UNPUBLISH'] as const) {
    it(`${action} carries no note, even if the note box still holds text`, () => {
      assert.deepEqual(lessonTransitionBody(action, { contentRevision: 3 }, 'leftover'), { expectedContentRevision: 3 });
    });
  }

  it('uses the workflow state\'s contentRevision, not any other number', () => {
    assert.deepEqual(lessonTransitionBody('PUBLISH', { contentRevision: 12 }), { expectedContentRevision: 12 });
  });

  it('omits the stale-edit guard when the revision is unknown or invalid (the backend treats it as optional)', () => {
    assert.deepEqual(lessonTransitionBody('APPROVE', null), {});
    assert.deepEqual(lessonTransitionBody('APPROVE', {}), {});
    assert.deepEqual(lessonTransitionBody('APPROVE', { contentRevision: 0 }), {});
    assert.deepEqual(lessonTransitionBody('APPROVE', { contentRevision: 1.5 }), {});
  });
});

describe('course and module transitions (CatalogTransitionDto / CatalogRequestChangesDto)', () => {
  for (const action of ACTIONS) {
    it(`${action}: sends only properties the backend accepts, never "version"`, () => {
      const body = catalogTransitionBody(action, { version: 4 }, 'note');
      for (const key of Object.keys(body)) assert.ok(CATALOG_ALLOWED.includes(key), `unexpected property ${key}`);
      assert.equal('version' in body, false);
      assert.equal(body.expectedVersion, 4);
    });
  }

  it('REQUEST_CHANGES carries the trimmed note; other actions do not', () => {
    assert.deepEqual(catalogTransitionBody('REQUEST_CHANGES', { version: 2 }, ' Reorder modules '), { note: 'Reorder modules', expectedVersion: 2 });
    assert.deepEqual(catalogTransitionBody('PUBLISH', { version: 2 }, 'leftover'), { expectedVersion: 2 });
  });

  it('omits the guard when the version is unknown', () => {
    assert.deepEqual(catalogTransitionBody('UNPUBLISH', undefined), {});
  });
});
