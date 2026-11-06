import { randomBytes, scryptSync, timingSafeEqual, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { config } from '../config.ts';
export const token = () => randomBytes(32).toString('hex');
export const hash = value => createHash('sha256').update(String(value)).digest('hex');
export function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}
export function passwordMatches(password, stored) {
  if (!stored?.includes(':')) return false;
  const [salt, h] = stored.split(':');
  const expected = Buffer.from(h, 'hex');
  const actual = scryptSync(String(password), salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export function safeEqual(a, b) {
  const x = Buffer.from(String(a)),
    y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
function encryptionKey() {
  if (!/^[a-f0-9]{64}$/i.test(config.key)) throw new Error('DATA_KEY_HEX must contain 32 random bytes encoded as 64 hex characters');
  return Buffer.from(config.key, 'hex');
}
export function encrypt(buffer) {
  const iv = randomBytes(12),
    c = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  return Buffer.concat([iv, c.update(buffer), c.final(), c.getAuthTag()]);
}
export function decrypt(buffer) {
  const d = createDecipheriv('aes-256-gcm', encryptionKey(), buffer.subarray(0, 12));
  d.setAuthTag(buffer.subarray(-16));
  return Buffer.concat([d.update(buffer.subarray(12, -16)), d.final()]);
}
export function seal(value) {
  return encrypt(Buffer.from(JSON.stringify(value))).toString('base64');
}
export function unseal(value) {
  return JSON.parse(decrypt(Buffer.from(value, 'base64')).toString());
}
