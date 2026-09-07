/**
 * Auth module — register, password login, QR-code login, JWT middleware.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'studyflow-dev-secret-change-me';
const JWT_EXPIRES = '30d';

const router = express.Router();

function now() { return new Date().toISOString(); }

// ---- JWT helpers ----
function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ---- Register ----
router.post('/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (username.length < 3) return res.status(400).json({ error: 'Username too short' });
  if (password.length < 6) return res.status(400).json({ error: 'Password too short' });

  try {
    const existing = await db.get('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) return res.status(409).json({ error: 'Username already exists' });

    const hash = await bcrypt.hash(password, 10);
    const result = await db.run(
      'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)',
      [username, hash, now()]
    );
    const user = { id: result.lastInsertRowid, username };
    const token = signToken(user);
    res.json({ token, user });
  } catch (e) {
    console.error('Register error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- Password login ----
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  try {
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(user);
    res.json({ token, user: { id: user.id, username: user.username } });
  } catch (e) {
    console.error('Login error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- QR login ----
// Step 1 (logged-in device): generate a one-time QR token bound to the user.
router.post('/qr/token', authMiddleware, async (req, res) => {
  try {
    const token = crypto.randomBytes(16).toString('hex');
    const expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await db.run(
      'INSERT INTO qr_login_tokens (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
      [token, req.user.id, now(), expires]
    );
    res.json({ token, expires_at: expires });
  } catch (e) {
    console.error('QR token error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// Step 2 (scanning device): redeem the QR token for a JWT.
router.post('/qr/login', async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Token required' });
  try {
    const row = await db.get(
      'SELECT * FROM qr_login_tokens WHERE token = ? AND used = 0 AND expires_at > ?',
      [token, now()]
    );
    if (!row) return res.status(401).json({ error: 'Invalid or expired QR token' });

    const user = await db.get('SELECT id, username FROM users WHERE id = ?', [row.user_id]);
    if (!user) return res.status(401).json({ error: 'User not found' });

    await db.run('UPDATE qr_login_tokens SET used = 1 WHERE token = ?', [token]);
    const jwtToken = signToken(user);
    res.json({ token: jwtToken, user });
  } catch (e) {
    console.error('QR login error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- Current user ----
router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

module.exports = { router, authMiddleware };
