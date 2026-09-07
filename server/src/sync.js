/**
 * Sync module — dual-mode (online/offline) data sync.
 *
 * Strategy (last-write-wins by updated_at, with tombstone deletes):
 * - Each session has: id, type, duration, subject, completed_at, updated_at, deleted
 * - Client PUSHes its local sessions; server merges:
 *     For each incoming session:
 *       - If not in DB -> insert
 *       - If in DB and incoming.updated_at >= db.updated_at -> update (or tombstone)
 *       - Else keep DB version
 * - Client PULLs all sessions where updated_at > since (or all)
 * - Client merges pulled sessions locally the same way.
 */
const express = require('express');
const db = require('./db');
const { authMiddleware } = require('./auth');

const router = express.Router();
router.use(authMiddleware);

function now() { return new Date().toISOString(); }

// ---- Pull sessions ----
// GET /sync/pull?since=ISO
router.get('/pull', async (req, res) => {
  const since = req.query.since || '1970-01-01T00:00:00.000Z';
  try {
    const rows = await db.query(
      'SELECT id, type, duration, subject, completed_at, updated_at, deleted FROM sessions WHERE user_id = ? AND updated_at > ?',
      [req.user.id, since]
    );
    res.json({ sessions: rows, server_now: now() });
  } catch (e) {
    console.error('Pull error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- Push sessions ----
// POST /sync/push  body: { sessions: [...] }
router.post('/push', async (req, res) => {
  const incoming = (req.body && req.body.sessions) || [];
  if (!Array.isArray(incoming)) return res.status(400).json({ error: 'sessions must be array' });

  let merged = [];
  try {
    await db.begin();
    for (const s of incoming) {
      if (!s || !s.id) continue;
      const existing = await db.get(
        'SELECT id, updated_at FROM sessions WHERE id = ? AND user_id = ?',
        [s.id, req.user.id]
      );
      const completedAt = s.completed_at || now();
      const updatedAt = s.updated_at || now();
      const deleted = s.deleted ? 1 : 0;

      if (!existing) {
        await db.run(
          `INSERT INTO sessions (id, user_id, type, duration, subject, completed_at, created_at, updated_at, deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [s.id, req.user.id, s.type || 'work', s.duration || 0, s.subject || null,
           completedAt, completedAt, updatedAt, deleted]
        );
      } else if (updatedAt >= existing.updated_at) {
        await db.run(
          `UPDATE sessions SET type=?, duration=?, subject=?, completed_at=?, updated_at=?, deleted=?
           WHERE id=? AND user_id=?`,
          [s.type || 'work', s.duration || 0, s.subject || null, completedAt, updatedAt, deleted,
           s.id, req.user.id]
        );
      }
    }
    await db.commit();
  } catch (e) {
    await db.rollback();
    console.error('Push error', e);
    return res.status(500).json({ error: 'Server error' });
  }

  // Return the server's authoritative view for this user (so client can reconcile)
  const rows = await db.query(
    'SELECT id, type, duration, subject, completed_at, updated_at, deleted FROM sessions WHERE user_id = ?',
    [req.user.id]
  );
  res.json({ ok: true, sessions: rows, server_now: now() });
});

module.exports = router;
