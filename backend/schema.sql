-- PostgreSQL schema for SHOOT Receipt BOOTH tickets
-- Run: psql $DATABASE_URL -f schema.sql

DO $$ BEGIN
  CREATE TYPE ticket_status AS ENUM ('unused', 'used');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS receipt_tickets (
  ticket_code CHAR(6) PRIMARY KEY,
  status ticket_status NOT NULL DEFAULT 'unused',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  chosen_frame VARCHAR(64),
  print_count INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT ticket_code_format CHECK (ticket_code ~ '^[0-9]{6}$')
);

CREATE INDEX IF NOT EXISTS idx_receipt_tickets_status ON receipt_tickets (status);
CREATE INDEX IF NOT EXISTS idx_receipt_tickets_used_at ON receipt_tickets (used_at);

ALTER TABLE receipt_tickets ADD COLUMN IF NOT EXISTS print_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS booth_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO booth_settings (setting_key, setting_value)
VALUES ('payment_amount', '59')
ON CONFLICT (setting_key) DO NOTHING;

INSERT INTO booth_settings (setting_key, setting_value)
VALUES ('omise_enabled', 'false')
ON CONFLICT (setting_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS payment_sessions (
  id UUID PRIMARY KEY,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  raw_notification TEXT,
  omise_source_id TEXT,
  omise_charge_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_payment_sessions_status ON payment_sessions (status);
CREATE INDEX IF NOT EXISTS idx_payment_sessions_created_at ON payment_sessions (created_at);

CREATE TABLE IF NOT EXISTS photo_sessions (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  layout_id TEXT,
  frame_id TEXT,
  print_count INTEGER NOT NULL DEFAULT 1,
  amount INTEGER NOT NULL,
  payment_mode TEXT NOT NULL DEFAULT 'omise',
  download_id TEXT,
  payment_session_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_photo_sessions_created_at ON photo_sessions (created_at);
