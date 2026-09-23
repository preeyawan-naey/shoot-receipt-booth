-- Phase 1: tenants, device pairing, device tokens (idempotent)

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO tenants (id, name)
VALUES ('00000000-0000-4000-8000-000000000001', 'Default tenant')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE booth_profiles ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

UPDATE booth_profiles
SET tenant_id = '00000000-0000-4000-8000-000000000001'
WHERE tenant_id IS NULL;

CREATE TABLE IF NOT EXISTS booth_pairing_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booth_id TEXT NOT NULL REFERENCES booth_profiles(booth_id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booth_pairing_codes_booth_id ON booth_pairing_codes (booth_id);
CREATE INDEX IF NOT EXISTS idx_booth_pairing_codes_code_hash ON booth_pairing_codes (code_hash);

CREATE TABLE IF NOT EXISTS booth_device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booth_id TEXT NOT NULL REFERENCES booth_profiles(booth_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_booth_device_tokens_booth_id ON booth_device_tokens (booth_id);
CREATE INDEX IF NOT EXISTS idx_booth_device_tokens_active
  ON booth_device_tokens (booth_id)
  WHERE revoked_at IS NULL;
