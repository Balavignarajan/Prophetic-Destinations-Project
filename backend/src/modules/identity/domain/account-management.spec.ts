import { isActiveAdmin, leavesNoActiveAdmin } from './account-management.js';

const admin = (id: string, role = 'ADMIN', status = 'ACTIVE') =>
  ({ id, role, status }) as never;

describe('isActiveAdmin', () => {
  it('is true only for an ACTIVE ADMIN', () => {
    expect(isActiveAdmin(admin('a'))).toBe(true);
    expect(isActiveAdmin(admin('a', 'ADMIN', 'DISABLED'))).toBe(false);
    expect(isActiveAdmin(admin('a', 'EDITOR'))).toBe(false);
  });
});

describe('leavesNoActiveAdmin', () => {
  const only = [admin('a')];
  const two = [admin('a'), admin('b')];

  it('is true when the only active ADMIN is disabled or demoted', () => {
    expect(
      leavesNoActiveAdmin(
        admin('a'),
        { role: 'ADMIN', status: 'DISABLED' },
        only,
      ),
    ).toBe(true);
    expect(
      leavesNoActiveAdmin(
        admin('a'),
        { role: 'EDITOR', status: 'ACTIVE' },
        only,
      ),
    ).toBe(true);
  });

  it('is false while another active ADMIN remains', () => {
    expect(
      leavesNoActiveAdmin(
        admin('a'),
        { role: 'ADMIN', status: 'DISABLED' },
        two,
      ),
    ).toBe(false);
    expect(
      leavesNoActiveAdmin(
        admin('a'),
        { role: 'REVIEWER', status: 'ACTIVE' },
        two,
      ),
    ).toBe(false);
  });

  it('is false for changes that keep the target an active ADMIN, or that do not involve one', () => {
    expect(
      leavesNoActiveAdmin(
        admin('a'),
        { role: 'ADMIN', status: 'ACTIVE' },
        only,
      ),
    ).toBe(false);
    expect(
      leavesNoActiveAdmin(
        admin('e', 'EDITOR'),
        { role: 'EDITOR', status: 'DISABLED' },
        only,
      ),
    ).toBe(false);
    expect(
      leavesNoActiveAdmin(
        admin('e', 'EDITOR', 'DISABLED'),
        { role: 'ADMIN', status: 'ACTIVE' },
        only,
      ),
    ).toBe(false);
  });

  it('counts only active ADMINs other than the target', () => {
    const withTarget = [admin('a'), admin('a')];
    expect(
      leavesNoActiveAdmin(
        admin('a'),
        { role: 'ADMIN', status: 'DISABLED' },
        withTarget,
      ),
    ).toBe(true);
  });
});
