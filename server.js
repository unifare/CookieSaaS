const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const services = require('./services');

const app = express();
const PORT = process.env.PORT || 28472;

// --- Setup EJS & Middleware ---
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// --- Authentication Middleware ---
const requireAuth = (req, res, next) => {
  let token = req.cookies.token;
  if (!token && req.headers.authorization) {
    token = req.headers.authorization.split(' ')[1];
  }
  
  if (!token) {
    if (req.accepts('html')) return res.redirect('/login');
    return res.status(401).json({ error: 'Missing token' });
  }

  const user = services.getUserByToken(token);
  if (!user) {
    if (req.accepts('html')) return res.redirect('/login');
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  req.user = user;
  next();
};

const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    if (req.accepts('html')) return res.status(403).send('Forbidden');
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

// --- View Routes (MPA) ---
app.get('/login', (req, res) => {
  if (req.cookies.token && services.getUserByToken(req.cookies.token)) {
    return res.redirect('/dashboard');
  }
  res.render('login');
});

app.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login');
});

app.get('/', (req, res) => res.redirect('/dashboard'));

app.get('/dashboard', requireAuth, (req, res) => {
  const stats = services.listDomainStats(req.user.id);
  res.render('dashboard', { user: req.user, stats, currentPath: '/dashboard' });
});

app.get('/cookies', requireAuth, (req, res) => {
  const search = req.query.search || '';
  const domainFilter = req.query.domain || '';
  
  const domainGroups = services.getCookiesGrouped(req.user.id, search, domainFilter);
  const domains = services.getDistinctDomains(req.user.id);
  
  res.render('cookies', { 
    user: req.user, 
    domainGroups, 
    domains,
    search,
    domainFilter,
    currentPath: '/cookies' 
  });
});

app.get('/profile', requireAuth, (req, res) => {
  res.render('profile', { user: req.user, currentPath: '/profile' });
});

app.get('/admin', requireAuth, requireAdmin, (req, res) => {
  const users = services.getAllUsers();
  res.render('admin', { user: req.user, users, currentPath: '/admin' });
});

app.get('/settings', requireAuth, requireAdmin, (req, res) => {
  const regEnabled = services.getSetting('registration_enabled') === '1';
  res.render('settings', { user: req.user, regEnabled, currentPath: '/settings' });
});


// --- API Routes ---
app.post('/api/auth/register', (req, res) => {
  const regEnabled = services.getSetting('registration_enabled');
  if (regEnabled === '0') return res.status(403).json({ error: 'Registration disabled' });
  
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Missing fields' });
  try {
    const user = services.registerUser(username, password);
    res.cookie('token', user.apiToken, { httpOnly: true });
    res.json(user);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  try {
    const user = services.loginUser(username, password);
    res.cookie('token', user.apiToken, { httpOnly: true });
    res.json(user);
  } catch(err) {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.post('/api/user/token/rotate', requireAuth, (req, res) => {
  const newToken = services.generateNewApiToken(req.user.id);
  res.cookie('token', newToken, { httpOnly: true });
  res.json({ apiToken: newToken });
});

app.post('/api/user/password', requireAuth, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  try {
    services.changePassword(req.user.id, oldPassword, newPassword);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot delete yourself' });
  services.deleteUser(req.params.id);
  res.json({ success: true });
});

app.post('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  try {
    const { username, password, role } = req.body;
    services.adminCreateUser(username, password, role);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/users/:id/reset-password', requireAuth, requireAdmin, (req, res) => {
  try {
    services.adminResetPassword(req.params.id, req.body.newPassword);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/users/:id/toggle-status', requireAuth, requireAdmin, (req, res) => {
  if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: 'Cannot toggle your own status' });
  try {
    services.toggleUserStatus(req.params.id, req.body.isActive);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/admin/settings/registration', requireAuth, requireAdmin, (req, res) => {
  const enabled = req.body.enabled ? '1' : '0';
  services.setSetting('registration_enabled', enabled);
  res.json({ success: true });
});

app.post('/api/cookies/import', requireAuth, (req, res) => {
  const cookies = req.body;
  if (!Array.isArray(cookies)) return res.status(400).json({ error: 'Expected array' });
  const changes = services.importCookies(req.user.id, cookies);
  res.json({ success: true, imported: changes });
});

app.get('/api/cookies/export', requireAuth, (req, res) => {
  res.json(services.exportCookies(req.user.id, req.query.domain));
});

app.delete('/api/cookies/:domain', requireAuth, (req, res) => {
  const changes = services.deleteDomainCookies(req.user.id, req.params.domain);
  res.json({ success: true, deletedCount: changes });
});

app.delete('/api/cookies/:domain/:name', requireAuth, (req, res) => {
  const changes = services.deleteSingleCookie(req.user.id, req.params.domain, req.params.name);
  if (changes === 0) return res.status(404).json({ error: 'Cookie not found' });
  res.json({ success: true });
});

// Remove SPA catch-all and replace with 404
app.use((req, res) => {
  res.status(404).send('Page Not Found');
});

app.listen(PORT, () => {
  console.log(`🍪 Cookie Service (MPA) is running on http://localhost:${PORT}`);
});
