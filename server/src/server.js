/**
 * StudyFlow Server — entry point.
 *
 * Features:
 *  - Auth: register / password-login / QR-code login (JWT)
 *  - Sync: pull/push study sessions with last-write-wins conflict resolution
 *  - Community: create/join, study-standard proposals, majority voting
 *
 * Database: MySQL primary (mysql2), SQLite fallback (better-sqlite3).
 *
 * Env vars:
 *   PORT              default 3000
 *   JWT_SECRET        default 'studyflow-dev-secret-change-me'
 *   MYSQL_HOST/PORT/USER/PASSWORD/DATABASE
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');
const { rateLimit } = require('./ratelimit');
const { router: authRouter } = require('./auth');
const syncRouter = require('./sync');
const communityRouter = require('./community');

const PORT = parseInt(process.env.PORT || '3000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';
const DEFAULT_JWT_SECRET = 'studyflow-dev-secret-change-me';

// Refuse to start with the well-known default signing key: anyone who knows it
// can mint a valid token for any user.
if (NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEFAULT_JWT_SECRET)) {
  console.error('\n  FATAL: JWT_SECRET must be set to a strong random value in production.');
  console.error('  Refusing to start — the default secret is publicly known.\n');
  process.exit(1);
}
if (!process.env.JWT_SECRET) {
  console.warn('\n  WARNING: JWT_SECRET is not set; using the insecure default.');
  console.warn('  Set JWT_SECRET=<random string> before exposing this server.\n');
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve the frontend (single index.html) for web usage
app.use(express.static(path.join(__dirname, '..', '..', 'build', 'share')));

// Baseline protection for every API route; auth endpoints tighten this further.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX || '600', 10),
  message: 'Too many requests — please slow down',
});
app.use('/api', apiLimiter);

// API routes
app.use('/api/auth', authRouter);
app.use('/api/sync', syncRouter);
app.use('/api/community', communityRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, driver: db.driver, time: new Date().toISOString() });
});

// SPA fallback
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', '..', 'build', 'share', 'index.html'));
});

(async () => {
  try {
    const driver = await db.init();
    app.listen(PORT, () => {
      console.log(`\n  StudyFlow server running on http://localhost:${PORT}`);
      console.log(`  Database driver: ${driver}`);
      console.log(`  Frontend: http://localhost:${PORT}\n`);
    });
  } catch (e) {
    console.error('Failed to start server:', e);
    if (e && /ECONNREFUSED|ER_ACCESS_DENIED|ETIMEDOUT|ENOTFOUND/.test(e.message || '')) {
      console.error('Hint: check MYSQL_* env vars, or set DB_STRICT=0 to allow the SQLite fallback.');
    }
    process.exit(1);
  }
})();
