/**
 * StudyFlow Database Layer
 * Primary: MySQL (mysql2)
 * Fallback: SQLite (better-sqlite3) — used when MySQL is unreachable,
 *           so the system still runs in development / single-machine setups.
 *
 * Exposes a common query interface:
 *   db.query(sql, params) -> Promise<Array<row>>
 *   db.get(sql, params)   -> Promise<row | null>
 *   db.run(sql, params)   -> Promise<{ changes, lastInsertRowid }>
 *   db.transaction(fn)    -> runs fn() atomically, rolls back on throw
 *   db.begin() / db.commit() / db.rollback()
 *
 * Env vars:
 *   DB_STRICT=1  -> never fall back to SQLite; fail fast instead.
 */
const path = require('path');
const fs = require('fs');

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'studyflow',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

let pool = null;
let sqliteDb = null;
let driver = 'sqlite';
// Dedicated connection for an open MySQL transaction. pool.query() may run on
// a different connection each call, which silently breaks transaction
// semantics — every statement inside a transaction MUST reuse this connection.
let txConn = null;

async function initMysql() {
  const mysql = require('mysql2/promise');
  pool = mysql.createPool(MYSQL_CONFIG);
  // Test connection
  const conn = await pool.getConnection();
  await conn.query('SELECT 1');
  conn.release();
  driver = 'mysql';
  console.log('[db] MySQL connected:', MYSQL_CONFIG.host + ':' + MYSQL_CONFIG.port + '/' + MYSQL_CONFIG.database);
}

function initSqlite() {
  // Prefer the original `better-sqlite3` (sync API, very fast). Its native
  // binding only loads at `new Database()`, so we probe there and fall back to
  // Node 22's built-in `node:sqlite` when the binding can't be resolved
  // (e.g. GitHub-blocked npm prebuild + no node-gyp). The subset of the API
  // db.js uses (prepare/all/get/run/exec/pragma) is compatible.
  const dbPath = process.env.SF_DATA_DIR
    ? path.join(process.env.SF_DATA_DIR, 'data.sqlite')
    : path.join(__dirname, '..', 'data.sqlite');
  let Better;
  try { Better = require('better-sqlite3'); } catch (_) { Better = null; }
  if (Better) {
    try {
      sqliteDb = new Better(dbPath);
      sqliteDb.pragma('journal_mode = WAL');
      driver = 'sqlite';
      console.log('[db] SQLite (better-sqlite3) opened:', dbPath);
      return;
    } catch (e) {
      console.warn('[db] better-sqlite3 init failed (' + e.message.split('\n')[0] + '), falling back to built-in node:sqlite.');
    }
  }
  const { DatabaseSync } = require('node:sqlite');
  sqliteDb = {
    _d: new DatabaseSync(dbPath),
    pragma(s) { this._d.exec('PRAGMA ' + s); return this._d; },
    prepare(sql) { return this._d.prepare(sql); },
    exec(sql) { this._d.exec(sql); },
  };
  sqliteDb.pragma('journal_mode = WAL');
  driver = 'sqlite';
  console.log('[db] SQLite (node:sqlite built-in) opened:', dbPath);
}

// Convert MySQL ? placeholders to SQLite-compatible (they already use ?)
// Convert ON DUPLICATE KEY UPDATE to SQLite upsert where needed
function translate(sql) {
  if (driver === 'sqlite') {
    // MySQL backticks -> double quotes
    sql = sql.replace(/`/g, '"');
    // AUTO_INCREMENT -> AUTOINCREMENT not needed at runtime (only schema)
    // DATETIME defaults handled by app
  }
  return sql;
}

function query(sql, params = []) {
  sql = translate(sql);
  if (driver === 'mysql') {
    return (txConn || pool).query(sql, params).then(([rows]) => rows);
  }
  return Promise.resolve(sqliteDb.prepare(sql).all(...params));
}

function get(sql, params = []) {
  sql = translate(sql);
  if (driver === 'mysql') {
    return (txConn || pool).query(sql, params).then(([rows]) => rows[0] || null);
  }
  return Promise.resolve(sqliteDb.prepare(sql).get(...params) || null);
}

function run(sql, params = []) {
  sql = translate(sql);
  if (driver === 'mysql') {
    return (txConn || pool).query(sql, params).then(([result]) => ({
      changes: result.affectedRows,
      lastInsertRowid: result.insertId,
    }));
  }
  const stmt = sqliteDb.prepare(sql);
  const info = stmt.run(...params);
  return Promise.resolve({ changes: info.changes, lastInsertRowid: info.lastInsertRowid });
}

/** Run fn() inside a transaction. MySQL pins a single pooled connection for
 *  the duration; SQLite uses its single connection. */
async function transaction(fn) {
  await begin();
  try {
    const out = await fn();
    await commit();
    return out;
  } catch (e) {
    await rollback();
    throw e;
  }
}

function begin() {
  if (driver === 'mysql') {
    if (txConn) return Promise.resolve(); // already inside a transaction
    return pool.getConnection().then(async (conn) => {
      txConn = conn;
      await conn.beginTransaction();
    });
  }
  sqliteDb.exec('BEGIN');
  return Promise.resolve();
}

function commit() {
  if (driver === 'mysql') {
    const conn = txConn;
    if (!conn) return Promise.resolve();
    return conn.commit()
      .catch(async (e) => { try { await conn.rollback(); } catch (_) {} throw e; })
      .finally(() => { conn.release(); if (txConn === conn) txConn = null; });
  }
  sqliteDb.exec('COMMIT');
  return Promise.resolve();
}

function rollback() {
  if (driver === 'mysql') {
    const conn = txConn;
    if (!conn) return Promise.resolve();
    return conn.rollback()
      .catch(() => {})
      .finally(() => { conn.release(); if (txConn === conn) txConn = null; });
  }
  sqliteDb.exec('ROLLBACK');
  return Promise.resolve();
}

// --- Schema ---
const SCHEMA_SQLITE = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  duration INTEGER NOT NULL,
  subject TEXT,
  completed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS communities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  created_by INTEGER NOT NULL,
  invite_code TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS community_members (
  community_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at TEXT NOT NULL,
  PRIMARY KEY (community_id, user_id)
);
CREATE TABLE IF NOT EXISTS proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  community_id INTEGER NOT NULL,
  proposer_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  target_minutes INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS proposal_votes (
  proposal_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  vote INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (proposal_id, user_id)
);
CREATE TABLE IF NOT EXISTS qr_login_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER DEFAULT 0
);
`;

async function ensureSchema() {
  if (driver === 'sqlite') {
    sqliteDb.exec(SCHEMA_SQLITE);
    console.log('[db] SQLite schema ensured.');
  } else {
    // MySQL: create tables if not exist (idempotent)
    const mysqlSchema = fs.readFileSync(path.join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
    const statements = mysqlSchema.split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await pool.query(stmt);
    }
    console.log('[db] MySQL schema ensured.');
  }
}

function fallbackAllowed() {
  const raw = process.env.DB_STRICT;
  if (raw !== undefined && raw !== '') {
    const v = String(raw).toLowerCase();
    return !(v === '1' || v === 'true' || v === 'yes');
  }
  // Default: strict in production, permissive in development.
  return process.env.NODE_ENV !== 'production';
}

async function init() {
  try {
    await initMysql();
  } catch (e) {
    if (!fallbackAllowed()) {
      console.error(
        '[db] MySQL unavailable and SQLite fallback is disabled ' +
        '(DB_STRICT=' + (process.env.DB_STRICT || '') + ', NODE_ENV=' + (process.env.NODE_ENV || '') + '). ' +
        'Refusing to start: ' + e.message
      );
      throw e;
    }
    console.warn('[db] MySQL unavailable, falling back to SQLite:', e.message);
    console.warn('[db] WARNING: writes are going to a LOCAL SQLite file, not your MySQL database.');
    console.warn('[db] Set DB_STRICT=1 to make this a hard failure instead.');
    initSqlite();
  }
  await ensureSchema();
  return driver;
}

module.exports = {
  init, query, get, run,
  begin, commit, rollback, transaction,
  get driver() { return driver; },
};
