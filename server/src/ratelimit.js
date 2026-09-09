/**
 * Zero-dependency in-memory rate limiter.
 *
 * Scope: a single server process. Behind multiple instances, put a shared
 * limiter at the proxy instead — this one is process-local by design.
 *
 * Usage:
 *   app.use('/api/auth', rateLimit({ windowMs: 15 * 60e3, max: 20 }));
 */
const buckets = new Map();

/** Purge expired buckets so the map cannot grow without bound. */
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}, 60 * 1000);
if (sweeper.unref) sweeper.unref(); // never hold the process open

function rateLimit(options = {}) {
  const {
    windowMs = 15 * 60 * 1000,
    max = 100,
    message = 'Too many requests — please slow down',
    keyFn = (req) => req.ip || req.connection?.remoteAddress || 'unknown',
    skipSuccessful = false,
  } = options;

  return function rateLimitMiddleware(req, res, next) {
    const key = keyFn(req);
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + windowMs };
      buckets.set(key, b);
    }
    b.count++;

    const remaining = Math.max(0, max - b.count);
    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(b.resetAt / 1000)));

    if (b.count > max) {
      const retryAfter = Math.ceil((b.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: message,
        retry_after_seconds: retryAfter,
      });
    }

    if (skipSuccessful) {
      // Refund the ticket when the request succeeds — useful for login
      // endpoints, where only failures should count against the budget.
      res.on('finish', () => {
        if (res.statusCode < 400) {
          const cur = buckets.get(key);
          if (cur && cur.count > 0) cur.count--;
        }
      });
    }
    next();
  };
}

/**
 * Failure tracker for credential endpoints: lock a key after `maxFailures`
 * wrong attempts inside `windowMs`, for `lockMs`.
 */
function createLockout({ maxFailures = 5, windowMs = 15 * 60 * 1000, lockMs = 15 * 60 * 1000 } = {}) {
  const attempts = new Map(); // key -> { count, firstAt, lockedUntil }

  const purge = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of attempts) {
      if (v.lockedUntil && v.lockedUntil <= now) attempts.delete(k);
      else if (!v.lockedUntil && v.firstAt + windowMs <= now) attempts.delete(k);
    }
  }, 60 * 1000);
  if (purge.unref) purge.unref();

  return {
    /** @returns {number|null} seconds remaining if locked, else null */
    lockedFor(key) {
      const a = attempts.get(key);
      if (!a) return null;
      const now = Date.now();
      if (a.lockedUntil && a.lockedUntil > now) return Math.ceil((a.lockedUntil - now) / 1000);
      if (a.lockedUntil && a.lockedUntil <= now) attempts.delete(key);
      return null;
    },
    recordFailure(key) {
      const now = Date.now();
      let a = attempts.get(key);
      if (!a || a.firstAt + windowMs <= now) a = { count: 0, firstAt: now, lockedUntil: 0 };
      a.count++;
      if (a.count >= maxFailures) {
        a.lockedUntil = now + lockMs;
        attempts.set(key, a);
        return Math.ceil(lockMs / 1000);
      }
      attempts.set(key, a);
      return null;
    },
    clear(key) { attempts.delete(key); },
  };
}

module.exports = { rateLimit, createLockout };
