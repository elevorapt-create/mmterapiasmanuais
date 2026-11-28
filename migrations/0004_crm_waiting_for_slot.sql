-- Rebuild the stage constraint and copy dependent records before dropping the old tables.
-- The replacement history and appointments point at the replacement leads while copying.
CREATE TABLE leads_new (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  service_id INTEGER REFERENCES services(id),
  stage TEXT NOT NULL CHECK (stage IN (
    'new', 'conversation', 'follow_up', 'waiting_for_slot', 'scheduled', 'completed', 'lost'
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
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  service_name TEXT,
  service_price_cents INTEGER CHECK (service_price_cents >= 0),
  first_contact_at TEXT NOT NULL DEFAULT ''
);

INSERT INTO leads_new (
  id, name, phone, email, service_id, stage, qualification, source, entry_method, next_action,
  follow_up_on, appointment_at, notes, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
  version, created_at, updated_at, service_name, service_price_cents, first_contact_at
)
SELECT id, name, phone, email, service_id, stage, qualification, source, entry_method, next_action,
  follow_up_on, appointment_at, notes, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
  version, created_at, updated_at, service_name, service_price_cents, first_contact_at
FROM leads;

CREATE TABLE lead_history_new (
  id INTEGER PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads_new(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  qualification TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO lead_history_new (id, lead_id, stage, qualification, created_at)
SELECT id, lead_id, stage, qualification, created_at FROM lead_history;

CREATE TABLE client_appointments_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads_new(id) ON DELETE CASCADE,
  appointment_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  service_name TEXT,
  service_price_cents INTEGER CHECK (service_price_cents >= 0),
  linked_to_lead INTEGER NOT NULL DEFAULT 0 CHECK (linked_to_lead IN (0, 1))
);

INSERT INTO client_appointments_new (id, lead_id, appointment_at, status, service_name, service_price_cents, linked_to_lead)
SELECT id, lead_id, appointment_at, status, service_name, service_price_cents, linked_to_lead FROM client_appointments;

CREATE TABLE crm_stage_migration_check (copies_match INTEGER NOT NULL CHECK (copies_match = 1));
INSERT INTO crm_stage_migration_check
SELECT (SELECT count(*) FROM leads) = (SELECT count(*) FROM leads_new)
  AND (SELECT count(*) FROM lead_history) = (SELECT count(*) FROM lead_history_new)
  AND (SELECT count(*) FROM client_appointments) = (SELECT count(*) FROM client_appointments_new);
DROP TABLE crm_stage_migration_check;

DROP TRIGGER detach_deleted_service;
DROP TABLE client_appointments;
DROP TABLE lead_history;
DROP TABLE leads;

ALTER TABLE leads_new RENAME TO leads;
ALTER TABLE lead_history_new RENAME TO lead_history;
ALTER TABLE client_appointments_new RENAME TO client_appointments;

CREATE INDEX leads_follow_up ON leads(follow_up_on, updated_at DESC, id DESC);
CREATE INDEX lead_history_lead ON lead_history(lead_id, id DESC);
CREATE INDEX client_appointments_history ON client_appointments(lead_id, appointment_at DESC, id DESC);
CREATE UNIQUE INDEX client_appointments_current ON client_appointments(lead_id) WHERE linked_to_lead = 1;

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

CREATE TRIGGER reserve_lead_id AFTER INSERT ON leads
BEGIN
  UPDATE crm_record_sequences SET last_id = max(last_id, NEW.id) WHERE resource = 'leads';
END;

CREATE TRIGGER capture_lead_service_on_insert AFTER INSERT ON leads
WHEN NEW.service_id IS NOT NULL
BEGIN
  UPDATE leads
  SET (service_name, service_price_cents) = (
    SELECT name, price_cents FROM services WHERE id = NEW.service_id
  )
  WHERE id = NEW.id;
END;

CREATE TRIGGER capture_lead_service_on_change AFTER UPDATE OF service_id ON leads
WHEN OLD.service_id IS NOT NEW.service_id
  AND (NEW.service_id IS NOT NULL OR EXISTS (SELECT 1 FROM services WHERE id = OLD.service_id))
BEGIN
  UPDATE leads
  SET (service_name, service_price_cents) = (
    SELECT name, price_cents FROM services WHERE id = NEW.service_id
  )
  WHERE id = NEW.id;
END;

CREATE TRIGGER detach_deleted_service AFTER DELETE ON services
BEGIN
  UPDATE leads
  SET service_id = NULL, version = version + 1
  WHERE service_id = OLD.id;
END;

CREATE TRIGGER record_initial_pipeline_appointment AFTER INSERT ON leads
WHEN NEW.stage IN ('scheduled', 'completed') AND NEW.appointment_at <> ''
BEGIN
  INSERT INTO client_appointments (lead_id, appointment_at, status, service_name, service_price_cents, linked_to_lead)
  VALUES (NEW.id, NEW.appointment_at, NEW.stage,
    (SELECT name FROM services WHERE id = NEW.service_id),
    (SELECT price_cents FROM services WHERE id = NEW.service_id), 1);
END;

CREATE TRIGGER sync_pipeline_appointment AFTER UPDATE OF stage, appointment_at ON leads
WHEN OLD.stage IS NOT NEW.stage OR OLD.appointment_at IS NOT NEW.appointment_at
BEGIN
  UPDATE client_appointments
  SET linked_to_lead = 0, status = CASE status WHEN 'scheduled' THEN 'cancelled' ELSE status END
  WHERE lead_id = NEW.id AND linked_to_lead = 1
    AND (NEW.stage NOT IN ('scheduled', 'completed') OR NEW.appointment_at <> appointment_at);

  UPDATE client_appointments
  SET status = NEW.stage
  WHERE lead_id = NEW.id AND linked_to_lead = 1 AND status <> NEW.stage;

  INSERT INTO client_appointments (lead_id, appointment_at, status, service_name, service_price_cents, linked_to_lead)
  SELECT NEW.id, NEW.appointment_at, NEW.stage,
    CASE WHEN NEW.service_id IS OLD.service_id THEN NEW.service_name ELSE (SELECT name FROM services WHERE id = NEW.service_id) END,
    CASE WHEN NEW.service_id IS OLD.service_id THEN NEW.service_price_cents ELSE (SELECT price_cents FROM services WHERE id = NEW.service_id) END, 1
  WHERE NEW.stage IN ('scheduled', 'completed') AND NEW.appointment_at <> ''
    AND NOT EXISTS (SELECT 1 FROM client_appointments WHERE lead_id = NEW.id AND linked_to_lead = 1);
END;
