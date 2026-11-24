ALTER TABLE leads ADD COLUMN first_contact_at TEXT NOT NULL DEFAULT '';

CREATE TABLE client_appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  appointment_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  service_name TEXT,
  service_price_cents INTEGER CHECK (service_price_cents >= 0),
  linked_to_lead INTEGER NOT NULL DEFAULT 0 CHECK (linked_to_lead IN (0, 1))
);

CREATE INDEX client_appointments_history ON client_appointments(lead_id, appointment_at DESC, id DESC);
CREATE UNIQUE INDEX client_appointments_current ON client_appointments(lead_id) WHERE linked_to_lead = 1;

INSERT INTO client_appointments (lead_id, appointment_at, status, service_name, service_price_cents, linked_to_lead)
SELECT id, appointment_at, stage, service_name, service_price_cents, 1
FROM leads
WHERE stage IN ('scheduled', 'completed') AND appointment_at <> '';

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
