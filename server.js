const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret-in-railway-variables';

if (!ANTHROPIC_API_KEY) {
  console.warn('WARNING: ANTHROPIC_API_KEY is not set. Add it in Railway > Variables. Chat requests will fail until it is set.');
}

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify({}), 'utf8');
}

function readUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 30 // 30 days
    }
  })
);

function requireAuth(req, res, next) {
  if (req.session && req.session.username) return next();
  return res.status(401).json({ error: 'Not logged in' });
}

// ---------- Auth routes ----------

app.post('/api/signup', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  const cleanUsername = String(username).trim().toLowerCase();
  if (cleanUsername.length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  const users = readUsers();
  if (users[cleanUsername]) {
    return res.status(409).json({ error: 'That username is already taken.' });
  }
  const passwordHash = bcrypt.hashSync(password, 10);
  users[cleanUsername] = { passwordHash, createdAt: new Date().toISOString() };
  writeUsers(users);
  req.session.username = cleanUsername;
  res.json({ ok: true, username: cleanUsername });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }
  const cleanUsername = String(username).trim().toLowerCase();
  const users = readUsers();
  const user = users[cleanUsername];
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }
  req.session.username = cleanUsername;
  res.json({ ok: true, username: cleanUsername });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get('/api/me', (req, res) => {
  if (req.session && req.session.username) {
    return res.json({ loggedIn: true, username: req.session.username });
  }
  res.json({ loggedIn: false });
});

// ---------- Claude proxy ----------

app.post('/api/chat', requireAuth, async (req, res) => {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Server is missing ANTHROPIC_API_KEY. Ask the site owner to set it in Railway Variables.' });
  }
  const { messages, system, useSearch } = req.body || {};
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required.' });
  }

  const body = {
    model: 'claude-sonnet-5',
    max_tokens: 1500,
    system: system || '',
    messages
  };
  if (useSearch) {
    body.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
  }

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body)
    });

    if (!apiRes.ok) {
      const errText = await apiRes.text();
      return res.status(apiRes.status).json({ error: `Claude API error: ${errText}` });
    }

    const data = await apiRes.json();
    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n\n');
    res.json({ text: text || '(no text response)' });
  } catch (err) {
    res.status(500).json({ error: `Failed to reach Claude API: ${err.message}` });
  }
});

// ---------- Static frontend ----------

app.use(express.static(path.join(__dirname, 'public')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Draftline server running on port ${PORT}`);
});
