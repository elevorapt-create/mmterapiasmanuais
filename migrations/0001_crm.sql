CREATE TABLE services (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  duration_minutes INTEGER,
  price_cents INTEGER,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1,
  CHECK (duration_minutes > 0),
  CHECK (price_cents >= 0)
);

CREATE TABLE leads (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  service_id INTEGER REFERENCES services(id),
  stage TEXT NOT NULL CHECK (stage IN (
    'new', 'conversation', 'follow_up', 'scheduled', 'completed', 'lost'
  )),
  qualification TEXT NOT NULL CHECK (qualification IN ('unrated', 'cold', 'warm', 'hot')),
  source TEXT NOT NULL CHECK (source IN (
    'unknown', 'website', 'whatsapp', 'instagram', 'google', 'referral', 'other'
  )),
  entry_method TEXT NOT NULL DEFAULT 'manual',
  next_action TEXT NOT NULL DEFAULT '',
  follow_up_on TEXT NOT NULL DEFAULT '',
  appointment_at TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  utm_source TEXT NOT NULL DEFAULT '',
  utm_medium TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  utm_content TEXT NOT NULL DEFAULT '',
  utm_term TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX leads_follow_up ON leads(follow_up_on, updated_at DESC, id DESC);

CREATE TABLE lead_history (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  qualification TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX lead_history_lead ON lead_history(lead_id, id DESC);

CREATE TRIGGER record_new_lead AFTER INSERT ON leads
BEGIN
  INSERT INTO lead_history (lead_id, stage, qualification)
  VALUES (NEW.id, NEW.stage, NEW.qualification);
END;

CREATE TRIGGER record_lead_progress AFTER UPDATE OF stage, qualification ON leads
WHEN OLD.stage <> NEW.stage OR OLD.qualification <> NEW.qualification
BEGIN
  INSERT INTO lead_history (lead_id, stage, qualification)
  VALUES (NEW.id, NEW.stage, NEW.qualification);
END;

CREATE TABLE login_attempts (
  client_key TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
CREATE INDEX login_attempts_expiry ON login_attempts(expires_at);

CREATE TABLE admin_sessions (
  session_key TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE INDEX admin_sessions_expiry ON admin_sessions(expires_at);
