-- Velvet auth database schema (Cloudflare D1)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  hwid TEXT,
  hwid_resets_used INTEGER DEFAULT 0,
  hwid_resets_month TEXT,
  license_key TEXT,
  license_expires TEXT,
  status TEXT DEFAULT 'active',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS license_keys (
  id TEXT PRIMARY KEY,
  key_value TEXT UNIQUE NOT NULL,
  locked_hwid TEXT,
  expires TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  note TEXT,
  redeemed_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hwid_blacklist (
  id TEXT PRIMARY KEY,
  hwid TEXT UNIQUE NOT NULL,
  reason TEXT,
  added_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_keys_value ON license_keys(key_value);
CREATE INDEX IF NOT EXISTS idx_keys_redeemed ON license_keys(redeemed_by);
