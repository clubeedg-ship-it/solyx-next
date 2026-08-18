import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// AUTH_MODE=password: the configured password is never stored or compared
// as plaintext. `AUTH_PASSWORD_HASH` holds the output of hashPassword()
// below (see also scripts/hash-password.ts / `npm run hash-password`) —
// scrypt via Node's own node:crypto, no extra dependency. scrypt is
// deliberately memory-hard (unlike a bare SHA-256/HMAC), which is what
// makes offline guessing against a leaked hash expensive; that property is
// the whole point of hashing the password in the first place.

const FORMAT_PREFIX = "scrypt";
const KEY_LENGTH = 64;
// Node's own documented defaults for scryptSync (N=16384, r=8, p=1) — made
// explicit here rather than left implicit, so a future Node default change
// can't silently change what an already-generated hash means.
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;
// Default maxmem is 32MB; N=16384,r=8,p=1 needs roughly 128*N*r bytes ≈ 16MB,
// comfortably under that — spelled out so raising N later doesn't silently
// start throwing ERR_CRYPTO_INVALID_SCRYPT_PARAMS.

export class InvalidPasswordHashError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPasswordHashError";
  }
}

interface ParsedHash {
  salt: Buffer;
  hash: Buffer;
}

const HEX_RE = /^[0-9a-f]+$/i;

function parseHash(stored: string): ParsedHash {
  const parts = stored.split(":");
  const [prefix, saltHex, hashHex] = parts;
  if (parts.length !== 3 || prefix !== FORMAT_PREFIX || !saltHex || !hashHex || !HEX_RE.test(saltHex) || !HEX_RE.test(hashHex)) {
    throw new InvalidPasswordHashError(
      'AUTH_PASSWORD_HASH is not a valid hash (expected "scrypt:<saltHex>:<hashHex>"). Generate one with: npm run hash-password',
    );
  }
  return { salt: Buffer.from(saltHex, "hex"), hash: Buffer.from(hashHex, "hex") };
}

/** Throws InvalidPasswordHashError if `stored` isn't well-formed. Called at
 *  startup (config.ts) so a malformed AUTH_PASSWORD_HASH fails fast, before
 *  the process ever accepts a request, rather than on the first login
 *  attempt. */
export function assertValidPasswordHash(stored: string): void {
  parseHash(stored);
}

/** Hashes a plaintext password for storage in AUTH_PASSWORD_HASH. Used by
 *  scripts/hash-password.ts and directly in tests; never called on the
 *  request path (verifyPassword below is). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, KEY_LENGTH, SCRYPT_PARAMS);
  return `${FORMAT_PREFIX}:${salt.toString("hex")}:${derived.toString("hex")}`;
}

/**
 * Verifies a submitted password against the configured hash in
 * constant time — `crypto.timingSafeEqual`, never `===` or `Buffer.equals`,
 * so a byte-by-byte early exit can't leak how many leading bytes of a
 * guess were correct.
 *
 * Throws InvalidPasswordHashError if `stored` is malformed — in practice
 * this can't happen on the request path, since config.ts validates
 * AUTH_PASSWORD_HASH at startup via assertValidPasswordHash.
 */
export function verifyPassword(password: string, stored: string): boolean {
  const { salt, hash } = parseHash(stored);
  const candidate = scryptSync(password, salt, hash.length, SCRYPT_PARAMS);
  return timingSafeEqual(candidate, hash);
}
