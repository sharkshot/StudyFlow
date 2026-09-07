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
 *   db.begin() / db.commit() / db.rollback()
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
  const Database = require('better-sqlite3');
  const dbPath = path.join(__dirname, '..', 'data.sqlite');
  sqliteDb = new Database(dbPath);
  sqliteDb.pragma('journal_mode = WAL');
  driver = 'sqlite';
  console.log('[db] SQLite fallback opened:', dbPath);
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
    return pool.query(sql, params).then(([rows]) => rows);
  }
  return Promise.resolve(sqliteDb.prepare(sql).all(...params));
}

function get(sql, params = []) {
  sql = translate(sql);
  if (driver === 'mysql') {
    return pool.query(sql, params).then(([rows]) => rows[0] || null);
  }
  return Promise.resolve(sqliteDb.prepare(sql).get(...params) || null);
}

function run(sql, params = []) {
  sql = translate(sql);
  if (driver === 'mysql') {
    return pool.query(sql, params).then(([result]) => ({
      changes: result.affectedRows,
      lastInsertRowid: result.insertId,
    }));
  }
  const stmt = sqliteDb.prepare(sql);
  const info = stmt.run(...params);
  return Promise.resolve({ changes: info.changes, lastInsertRowid: info.lastInsertRowid });
}

function begin() {
  if (driver === 'mysql') return pool.query('START TRANSACTION');
  sqliteDb.exec('BEGIN');
  return Promise.resolve();
}
function commit() {
  if (driver === 'mysql') return pool.query('COMMIT');
  sqliteDb.exec('COMMIT');
  return Promise.resolve();
}
function rollback() {
  if (driver === 'mysql') return pool.query('ROLLBACK');
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

async function init() {
  try {
    await initMysql();
  } catch (e) {
    console.warn('[db] MySQL unavailable, falling back to SQLite:', e.message);
    initSqlite();
  }
  await ensureSchema();
  return driver;
}

module.exports = { init, query, get, run, begin, commit, rollback, get driver() { return driver; } };
