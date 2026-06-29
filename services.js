const db = require('./database');
const crypto = require('crypto');

// --- Auth Services ---
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
}

function registerUser(username, password) {
  const regEnabled = getSetting('registration_enabled');
  if (regEnabled !== '1') {
    throw new Error('Registration is currently disabled by admin.');
  }

  try {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);
    const apiToken = crypto.randomBytes(32).toString('hex');
    
    const insert = db.prepare('INSERT INTO users (username, password_hash, salt, api_token) VALUES (?, ?, ?, ?)');
    const info = insert.run(username, hash, salt, apiToken);
    return { success: true, userId: info.lastInsertRowid, apiToken };
  } catch (e) {
    if (e.message.includes('UNIQUE constraint failed')) {
      throw new Error('Username already exists');
    }
    throw e;
  }
}

function loginUser(username, password) {
  const stmt = db.prepare('SELECT id, password_hash, salt, api_token, role, is_active FROM users WHERE username = ?');
  const user = stmt.get(username);
  if (!user) throw new Error('Invalid credentials');
  if (user.is_active === 0) throw new Error('Account is disabled');
  
  const hash = hashPassword(password, user.salt);
  if (hash !== user.password_hash) throw new Error('Invalid credentials');
  
  return { id: user.id, username, role: user.role, apiToken: user.api_token };
}

function getUserByToken(token) {
  const stmt = db.prepare('SELECT id, username, role, api_token, is_active FROM users WHERE api_token = ?');
  const user = stmt.get(token);
  if (user && user.is_active === 0) return undefined;
  return user;
}

function generateNewApiToken(userId) {
  const newToken = crypto.randomBytes(32).toString('hex');
  const stmt = db.prepare('UPDATE users SET api_token = ? WHERE id = ?');
  stmt.run(newToken, userId);
  return newToken;
}

// --- Admin Services ---
function getAllUsers() {
  const stmt = db.prepare('SELECT id, username, role, api_token, is_active FROM users');
  return stmt.all();
}

function deleteUser(userId) {
  // SQLite with PRAGMA foreign_keys = ON will cascade delete cookies.
  // But by default, better-sqlite3/node:sqlite might not have it ON per connection unless specified.
  // We'll manually delete cookies first to be safe, then the user.
  db.exec('BEGIN TRANSACTION');
  try {
    db.prepare('DELETE FROM cookies WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    db.exec('COMMIT');
    return true;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value);
}

// --- Cookie Services ---
function importCookies(userId, cookies) {
  const insert = db.prepare(`
    INSERT INTO cookies (user_id, domain, name, value, path, expires, httpOnly, secure, sameSite)
    VALUES (@user_id, @domain, @name, @value, @path, @expires, @httpOnly, @secure, @sameSite)
    ON CONFLICT(user_id, domain, name) DO UPDATE SET
      value = excluded.value,
      path = excluded.path,
      expires = excluded.expires,
      httpOnly = excluded.httpOnly,
      secure = excluded.secure,
      sameSite = excluded.sameSite
  `);

  let count = 0;
  db.exec('BEGIN TRANSACTION');
  try {
    for (const cookie of cookies) {
      if (!cookie.domain || !cookie.name) continue;
      insert.run({
        user_id: userId,
        domain: cookie.domain,
        name: cookie.name,
        value: cookie.value || '',
        path: cookie.path || '/',
        expires: cookie.expires || -1,
        httpOnly: cookie.httpOnly ? 1 : 0,
        secure: cookie.secure ? 1 : 0,
        sameSite: cookie.sameSite || 'Lax'
      });
      count++;
    }
    db.exec('COMMIT');
    return count;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

function exportCookies(userId, domain) {
  let stmt;
  if (domain) {
    stmt = db.prepare('SELECT * FROM cookies WHERE user_id = ? AND domain LIKE ?');
    return stmt.all(userId, `%${domain}%`);
  } else {
    stmt = db.prepare('SELECT * FROM cookies WHERE user_id = ?');
    return stmt.all(userId);
  }
}

function getExactDomainCookies(userId, domain) {
  const stmt = db.prepare('SELECT * FROM cookies WHERE user_id = ? AND domain = ?');
  return stmt.all(userId, domain);
}

function listDomainStats(userId) {
  const stmt = db.prepare(`
    SELECT domain, COUNT(*) as count 
    FROM cookies 
    WHERE user_id = ?
    GROUP BY domain 
    ORDER BY domain
  `);
  return stmt.all(userId);
}

function deleteDomainCookies(userId, domain) {
  const stmt = db.prepare('DELETE FROM cookies WHERE user_id = ? AND domain = ?');
  const info = stmt.run(userId, domain);
  return info.changes;
}

function deleteSingleCookie(userId, domain, name) {
  const stmt = db.prepare('DELETE FROM cookies WHERE user_id = ? AND domain = ? AND name = ?');
  const info = stmt.run(userId, domain, name);
  return info.changes;
}

function getDistinctDomains(userId) {
  const stmt = db.prepare('SELECT DISTINCT domain FROM cookies WHERE user_id = ? ORDER BY domain');
  return stmt.all(userId).map(r => r.domain);
}

function getCookiesPaginated(userId, page = 1, limit = 50, search = '', domainFilter = '') {
  let query = 'FROM cookies WHERE user_id = ?';
  const params = [userId];

  if (domainFilter) {
    query += ' AND domain = ?';
    params.push(domainFilter);
  }

  if (search) {
    query += ' AND (name LIKE ? OR domain LIKE ? OR value LIKE ?)';
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam);
  }

  const countStmt = db.prepare(`SELECT COUNT(*) as total ${query}`);
  const total = countStmt.get(...params).total;

  const offset = (page - 1) * limit;
  const dataStmt = db.prepare(`SELECT * ${query} ORDER BY domain, name LIMIT ? OFFSET ?`);
  const data = dataStmt.all(...params, limit, offset);

  return {
    data,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

function getCookiesGrouped(userId, search = '', domainFilter = '') {
  let query = 'FROM cookies WHERE user_id = ?';
  const params = [userId];

  if (domainFilter) {
    query += ' AND domain = ?';
    params.push(domainFilter);
  }

  if (search) {
    query += ' AND (name LIKE ? OR domain LIKE ? OR value LIKE ?)';
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam);
  }

  const dataStmt = db.prepare(`SELECT * ${query} ORDER BY domain, name`);
  const data = dataStmt.all(...params);

  const grouped = {};
  data.forEach(row => {
    if (!grouped[row.domain]) grouped[row.domain] = [];
    grouped[row.domain].push(row);
  });
  
  return Object.keys(grouped).sort().map(domain => ({
    domain,
    cookies: grouped[domain]
  }));
}

function changePassword(userId, oldPassword, newPassword) {
  const stmt = db.prepare('SELECT password_hash, salt FROM users WHERE id = ?');
  const user = stmt.get(userId);
  if (!user) throw new Error('User not found');
  
  const oldHash = hashPassword(oldPassword, user.salt);
  if (oldHash !== user.password_hash) throw new Error('Incorrect old password');
  
  const newSalt = crypto.randomBytes(16).toString('hex');
  const newHash = hashPassword(newPassword, newSalt);
  
  const update = db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?');
  update.run(newHash, newSalt, userId);
}

function adminResetPassword(targetId, newPassword) {
  const newSalt = crypto.randomBytes(16).toString('hex');
  const newHash = hashPassword(newPassword, newSalt);
  
  const update = db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?');
  update.run(newHash, newSalt, targetId);
}

function toggleUserStatus(targetId, isActive) {
  const update = db.prepare('UPDATE users SET is_active = ? WHERE id = ?');
  update.run(isActive ? 1 : 0, targetId);
}

function adminCreateUser(username, password, role = 'user') {
  try {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);
    const apiToken = crypto.randomBytes(32).toString('hex');
    
    const insert = db.prepare('INSERT INTO users (username, password_hash, salt, api_token, role) VALUES (?, ?, ?, ?, ?)');
    const info = insert.run(username, hash, salt, apiToken, role);
    return { success: true, userId: info.lastInsertRowid };
  } catch (e) {
    if (e.message.includes('UNIQUE constraint failed')) {
      throw new Error('Username already exists');
    }
    throw e;
  }
}

module.exports = {
  registerUser, loginUser, getUserByToken, generateNewApiToken, 
  getAllUsers, deleteUser, getSetting, setSetting,
  importCookies, exportCookies, getExactDomainCookies, listDomainStats, deleteDomainCookies, deleteSingleCookie,
  getDistinctDomains, getCookiesPaginated, getCookiesGrouped,
  changePassword, adminResetPassword, toggleUserStatus, adminCreateUser
};
