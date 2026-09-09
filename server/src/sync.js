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

const MAX_PUSH = 5000;

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
  if (incoming.length > MAX_PUSH) {
    return res.status(413).json({ error: `Too many sessions in one push (max ${MAX_PUSH})` });
  }

  // Only the ids involved in this push are echoed back, so the response scales
  // with the push size instead of the user's entire history.
  const touched = [];
  let applied = 0;

  try {
    await db.begin();
    for (const s of incoming) {
      if (!s || !s.id) continue;
      if (typeof s.id !== 'string' || s.id.length > 64) continue;
      const existing = await db.get(
        'SELECT id, updated_at FROM sessions WHERE id = ? AND user_id = ?',
        [s.id, req.user.id]
      );
      const completedAt = s.completed_at || now();
      const updatedAt = s.updated_at || now();
      const deleted = s.deleted ? 1 : 0;
      touched.push(s.id);

      if (!existing) {
        await db.run(
          `INSERT INTO sessions (id, user_id, type, duration, subject, completed_at, created_at, updated_at, deleted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [s.id, req.user.id, s.type || 'work', s.duration || 0, s.subject || null,
           completedAt, completedAt, updatedAt, deleted]
        );
        applied++;
      } else if (updatedAt >= existing.updated_at) {
        await db.run(
          `UPDATE sessions SET type=?, duration=?, subject=?, completed_at=?, updated_at=?, deleted=?
           WHERE id=? AND user_id=?`,
          [s.type || 'work', s.duration || 0, s.subject || null, completedAt, updatedAt, deleted,
           s.id, req.user.id]
        );
        applied++;
      }
    }
    await db.commit();
  } catch (e) {
    await db.rollback();
    console.error('Push error', e);
    return res.status(500).json({ error: 'Server error' });
  }

  if (!touched.length) return res.json({ ok: true, sessions: [], applied: 0, server_now: now() });

  const rows = await db.query(
    `SELECT id, type, duration, subject, completed_at, updated_at, deleted
     FROM sessions WHERE user_id = ? AND id IN (${touched.map(() => '?').join(',')})`,
    [req.user.id, ...touched]
  );
  res.json({ ok: true, sessions: rows, applied, server_now: now() });
});

module.exports = router;
