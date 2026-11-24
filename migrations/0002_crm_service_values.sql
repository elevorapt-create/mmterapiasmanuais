ALTER TABLE leads ADD COLUMN service_name TEXT;
ALTER TABLE leads ADD COLUMN service_price_cents INTEGER CHECK (service_price_cents >= 0);

CREATE TABLE crm_record_sequences (
  resource TEXT PRIMARY KEY,
  last_id INTEGER NOT NULL
);
INSERT INTO crm_record_sequences SELECT 'leads', coalesce(max(id), 0) FROM leads;
INSERT INTO crm_record_sequences SELECT 'services', coalesce(max(id), 0) FROM services;

CREATE TRIGGER reserve_lead_id AFTER INSERT ON leads
BEGIN
  UPDATE crm_record_sequences SET last_id = max(last_id, NEW.id) WHERE resource = 'leads';
END;

CREATE TRIGGER reserve_service_id AFTER INSERT ON services
BEGIN
  UPDATE crm_record_sequences SET last_id = max(last_id, NEW.id) WHERE resource = 'services';
END;

UPDATE leads
SET (service_name, service_price_cents) = (
  SELECT name, price_cents FROM services WHERE services.id = leads.service_id
)
WHERE service_id IS NOT NULL;

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

-- An AFTER trigger detaches references before SQLite checks the foreign key.
-- The catalog row is already gone, so the lead retains its name and price.
CREATE TRIGGER detach_deleted_service AFTER DELETE ON services
BEGIN
  UPDATE leads
  SET service_id = NULL, version = version + 1
  WHERE service_id = OLD.id;
END;
