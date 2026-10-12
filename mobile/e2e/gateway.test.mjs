// The gateway's token and password helpers. If these were wrong, the end-to-end
// tests could pass against an auth stand-in that accepts anything.
//   node --test gateway.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hashPassword, signJwt, verifyJwt, verifyPassword } from './gateway.mjs';

const SECRET = 'test-secret-test-secret-test-secret-0123';

test('a signed token verifies and returns its claims', () => {
  const token = signJwt({ sub: 'u1', role: 'authenticated', exp: Date.now() / 1000 + 60 }, SECRET);
  assert.equal(verifyJwt(token, SECRET)?.sub, 'u1');
});

test('a token signed with another secret is rejected', () => {
  const token = signJwt({ sub: 'u1' }, 'some-other-secret-some-other-secret-0000');
  assert.equal(verifyJwt(token, SECRET), null);
});

test('a token whose claims were edited is rejected', () => {
  const [head, , sig] = signJwt({ sub: 'u1', role: 'authenticated' }, SECRET).split('.');
  const forged = Buffer.from(JSON.stringify({ sub: 'u1', role: 'service_role' })).toString('base64url');
  assert.equal(verifyJwt(`${head}.${forged}.${sig}`, SECRET), null);
});

test('an expired token is rejected', () => {
  const token = signJwt({ sub: 'u1', exp: Date.now() / 1000 - 1 }, SECRET);
  assert.equal(verifyJwt(token, SECRET), null);
});

test('malformed tokens are rejected without throwing', () => {
  for (const bad of [undefined, null, '', 'a.b', 'a.b.c.d', 'x.!!!.y']) {
    assert.equal(verifyJwt(bad, SECRET), null);
  }
});

test('passwords are salted and only the right one verifies', () => {
  const a = hashPassword('Correct-horse-1');
  const b = hashPassword('Correct-horse-1');
  assert.notEqual(a, b, 'same password, different salt');
  assert.ok(verifyPassword('Correct-horse-1', a));
  assert.ok(!verifyPassword('correct-horse-1', a));
  assert.ok(!verifyPassword('', a));
});

test('a stored value that is not an scrypt hash never verifies', () => {
  for (const stored of [undefined, null, '', 'Correct-horse-1', 'bcrypt$aa$bb']) {
    assert.ok(!verifyPassword('Correct-horse-1', stored));
  }
});
