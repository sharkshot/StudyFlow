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
const { router: authRouter } = require('./auth');
const syncRouter = require('./sync');
const communityRouter = require('./community');

const PORT = parseInt(process.env.PORT || '3000', 10);

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve the frontend (single index.html) for web usage
app.use(express.static(path.join(__dirname, '..', '..', 'build', 'share')));

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
    process.exit(1);
  }
})();
