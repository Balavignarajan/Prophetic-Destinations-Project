import { PasswordHasher } from './password-hasher.js';

describe('PasswordHasher', () => {
  const hasher = new PasswordHasher();
  const password = 'correct horse battery staple';

  it('hashes with argon2id and never contains the plaintext', async () => {
    const hash = await hasher.hash(password);
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).not.toContain(password);
  });

  it('salts: the same password hashes differently each time', async () => {
    expect(await hasher.hash(password)).not.toBe(await hasher.hash(password));
  });

  it('verifies the right password and rejects the wrong one', async () => {
    const hash = await hasher.hash(password);
    expect(await hasher.verify(hash, password)).toBe(true);
    expect(await hasher.verify(hash, 'wrong password')).toBe(false);
  });

  it('treats a malformed stored hash as a mismatch instead of throwing', async () => {
    expect(await hasher.verify('not-a-hash', password)).toBe(false);
    expect(await hasher.verify('', password)).toBe(false);
  });

  it('can burn verification time for unknown accounts', async () => {
    await expect(hasher.verifyAgainstDummy(password)).resolves.toBeUndefined();
  });
});
