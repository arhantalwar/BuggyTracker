import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

export async function hashPasscode(passcode) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(passcode, salt, 64);
  return { passcodeSalt: salt, passcodeHash: hash.toString('hex') };
}

export async function verifyPasscode(passcode, salt, expectedHash) {
  const actual = await scrypt(passcode, salt, 64);
  const expected = Buffer.from(expectedHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
