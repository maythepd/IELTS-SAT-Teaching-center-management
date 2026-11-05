import test from 'node:test';
import { randomBytes } from 'node:crypto';
process.env.DATA_KEY_HEX = randomBytes(32).toString('hex');
const {
  encrypt,
  decrypt,
  seal,
  unseal,
  passwordHash,
  passwordMatches
} = await import('../../vela-web/backend/src/utils/security.ts');
test('salted password hashes accept only the right password', () => {
  const one = passwordHash('a-correct-passphrase'),
    two = passwordHash('a-correct-passphrase');
  if (one === two || !passwordMatches('a-correct-passphrase', one) || passwordMatches('wrong', one)) throw new Error('Password hash policy failed');
});
test('AES-256-GCM round trip preserves file bytes and rejects modified ciphertext', () => {
  const original = randomBytes(2048),
    cipher = encrypt(original);
  if (cipher.equals(original) || !decrypt(cipher).equals(original)) throw new Error('Encryption round trip failed');
  cipher[20] ^= 1;
  let rejected = false;
  try {
    decrypt(cipher);
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error('Tampered file was accepted');
});
test('outbox payload encryption round trip', () => {
  const body = {
    body: 'Nhận xét tiếng Việt — không mất dấu'
  };
  if (unseal(seal(body)).body !== body.body) throw new Error('Email payload corrupted');
});
