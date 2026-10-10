import { ConflictError } from './domain-error.js';
import { checkExpectedVersion } from './versioning.js';

describe('optimistic version check', () => {
  it('passes when no version is given or it matches', () => {
    expect(() => checkExpectedVersion(3, undefined)).not.toThrow();
    expect(() => checkExpectedVersion(3, 3)).not.toThrow();
  });

  it('raises a conflict that reports the current version when stale', () => {
    try {
      checkExpectedVersion(4, 3);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as ConflictError).details).toEqual({ currentVersion: 4 });
    }
  });
});
