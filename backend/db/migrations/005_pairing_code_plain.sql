-- Admin-visible pairing code (plaintext) until used or expired; admin API only.

ALTER TABLE booth_pairing_codes ADD COLUMN IF NOT EXISTS code_plain TEXT;
