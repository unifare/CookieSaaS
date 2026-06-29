const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');

// Initialize database
const dbPath = path.join(__dirname, 'cookies.db');
const db = new DatabaseSync(dbPath);

// Users table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    api_token TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'user',
    is_active INTEGER NOT NULL DEFAULT 1
  )
`);

try {
  db.exec('ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1');
} catch(e) {
  // Column might already exist
}

// Cookies table
db.exec(`
  CREATE TABLE IF NOT EXISTS cookies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    domain TEXT NOT NULL,
    name TEXT NOT NULL,
    value TEXT NOT NULL,
    path TEXT,
    expires REAL,
    httpOnly INTEGER,
    secure INTEGER,
    sameSite TEXT,
    UNIQUE(user_id, domain, name),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

// Settings table
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )
`);

// Initialize default settings
const regSetting = db.prepare('SELECT value FROM settings WHERE key = ?').get('registration_enabled');
if (!regSetting) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('registration_enabled', '1');
}

// Create default admin user if no users exist
const userCountStmt = db.prepare('SELECT COUNT(*) as count FROM users');
const userCount = userCountStmt.get().count;

if (userCount === 0) {
  // Generate salt and hash for default password 'admin123'
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync('admin123', salt, 1000, 64, 'sha512').toString('hex');
  const apiToken = crypto.randomBytes(32).toString('hex');
  
  const insertAdmin = db.prepare(`
    INSERT INTO users (username, password_hash, salt, api_token, role)
    VALUES (?, ?, ?, ?, 'admin')
  `);
  insertAdmin.run('admin', hash, salt, apiToken);
  console.log('✅ Default admin user created (admin / admin123)');
}

module.exports = db;
