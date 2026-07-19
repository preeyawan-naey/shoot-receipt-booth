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
