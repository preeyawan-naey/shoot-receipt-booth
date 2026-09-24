-- First time the server received a bank notification, per booth.
-- received_at is the application server clock. Idempotent.

CREATE TABLE IF NOT EXISTS payment_notify_receipts (
  booth_id TEXT NOT NULL,
  notification_id TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (booth_id, notification_id)
);
