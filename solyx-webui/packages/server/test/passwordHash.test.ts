import { describe, expect, it } from "vitest";
import { InvalidPasswordHashError, assertValidPasswordHash, hashPassword, verifyPassword } from "../src/auth/passwordHash.js";

describe("hashPassword / verifyPassword", () => {
  it("accepts the correct password against its own hash", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects a wrong password", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("wrong password", hash)).toBe(false);
  });

  it("rejects the empty string when that isn't the configured password", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("", hash)).toBe(false);
  });

  it("produces a different hash (different salt) for the same password each time", () => {
    const a = hashPassword("same password");
    const b = hashPassword("same password");
    expect(a).not.toBe(b);
    expect(verifyPassword("same password", a)).toBe(true);
    expect(verifyPassword("same password", b)).toBe(true);
  });

  it("round-trips a password containing unicode and unusual characters", () => {
    const password = "wächtwoord-🔒-€uro's & spaces";
    const hash = hashPassword(password);
    expect(verifyPassword(password, hash)).toBe(true);
    expect(verifyPassword(password + " ", hash)).toBe(false);
  });

  it("is formatted as scrypt:<saltHex>:<hashHex>", () => {
    const hash = hashPassword("x");
    expect(hash).toMatch(/^scrypt:[0-9a-f]+:[0-9a-f]+$/);
  });
});

describe("assertValidPasswordHash", () => {
  it("accepts a hash produced by hashPassword", () => {
    expect(() => assertValidPasswordHash(hashPassword("anything"))).not.toThrow();
  });

  it.each([
    ["empty string", ""],
    ["plaintext password", "hunter2"],
    ["wrong prefix", "bcrypt:aa:bb"],
    ["missing a segment", "scrypt:aabbcc"],
    ["non-hex salt", "scrypt:not-hex:aabbcc"],
    ["non-hex hash", "scrypt:aabbcc:not-hex"],
  ])("rejects %s", (_label, value) => {
    expect(() => assertValidPasswordHash(value)).toThrow(InvalidPasswordHashError);
  });
});

describe("verifyPassword against a malformed stored hash", () => {
  it("throws InvalidPasswordHashError rather than silently accepting anything", () => {
    expect(() => verifyPassword("anything", "not-a-hash")).toThrow(InvalidPasswordHashError);
  });
});
