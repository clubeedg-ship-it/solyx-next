// Escalating per-bucket lockout for POST /login. AUTH_MODE=password means
// the password is the only thing gating an app that's directly reachable
// from the public internet (Cloudflare Access no longer sits in front of
// it) — unbounded guessing against that is a real attack, not a
// hypothetical, so failures get progressively slower rather than merely
// logged.
//
// In-memory, per-process: this is a single-instance app built for one user,
// so there's no case for a shared store here — the trade-off is that a
// restart resets every counter, which is acceptable for what this defends
// (online guessing, not an offline attack a restart would meaningfully aid).
//
// The bucket key is whatever http/clientIp.ts resolves per request — the
// raw TCP socket address by default, or a specific trusted proxy header's
// value when TRUSTED_PROXY_HEADER is configured (see that file and README
// "Auth" for exactly when trusting a header like that is safe). This
// module doesn't know or care which; it just keys a Map on whatever string
// it's given.
//
// A lockout is never permanent: `lockedUntil` is always a fixed point in
// time (`now + delay`, capped at `MAX_DELAY_MS` — 15 minutes), computed
// once when a failure crosses the free-attempt budget, and `recordFailure`
// itself refuses to push that point further out while it's still in the
// future (see the guard at the top of that method) — so a lockout can't be
// renewed or extended by hammering it, no matter how the caller behaves.
// It always elapses on its own, and the next attempt after that (whichever
// way it goes) is what decides what happens next. See
// test/loginRateLimiter.test.ts's "expires"/"does not extend" cases.

interface Attempt {
  failures: number;
  lockedUntil: number;
  lastFailureAt: number;
}

const FREE_ATTEMPTS = 5;
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 15 * 60 * 1_000;
// A quiet period this long forgets the failure count entirely — an attacker
// who stops for an hour starts over at the bottom of the ladder, same as a
// legitimate user who mistyped a few times yesterday.
const RESET_AFTER_MS = 60 * 60 * 1_000;

export class LoginRateLimiter {
  private readonly attempts = new Map<string, Attempt>();

  /** Milliseconds the caller must wait before another attempt is allowed.
   *  0 means it's allowed right now. */
  retryAfterMs(ip: string): number {
    const entry = this.attempts.get(ip);
    if (!entry) return 0;
    if (Date.now() - entry.lastFailureAt > RESET_AFTER_MS) {
      this.attempts.delete(ip);
      return 0;
    }
    return Math.max(0, entry.lockedUntil - Date.now());
  }

  /** Records a failed attempt and, once `FREE_ATTEMPTS` is exceeded, sets a
   *  lockout window — bounded, never permanent, see the file-level comment
   *  above — that doubles per additional failure, capped at
   *  `MAX_DELAY_MS`. A failure recorded while an existing lockout is still
   *  active is a no-op: it must never push `lockedUntil` further out, or a
   *  lockout could be renewed forever by sustained guessing during the
   *  window it's supposed to expire in. */
  recordFailure(ip: string): void {
    const now = Date.now();
    const existing = this.attempts.get(ip);
    if (existing && now < existing.lockedUntil) return;

    const stale = existing !== undefined && now - existing.lastFailureAt > RESET_AFTER_MS;
    const entry: Attempt = existing && !stale ? existing : { failures: 0, lockedUntil: 0, lastFailureAt: now };

    entry.failures += 1;
    entry.lastFailureAt = now;
    if (entry.failures > FREE_ATTEMPTS) {
      const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (entry.failures - FREE_ATTEMPTS - 1));
      entry.lockedUntil = now + delay;
    }
    this.attempts.set(ip, entry);
  }

  /** Clears an IP's failure history entirely on a successful login. */
  recordSuccess(ip: string): void {
    this.attempts.delete(ip);
  }
}
