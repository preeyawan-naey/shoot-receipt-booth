-- Per-booth payment detector. Missing rows stay "macrodroid" in application code.
-- Snap on Receipt is the listener booth. Do not overwrite a value already set.

INSERT INTO booth_payment_settings (booth_id, setting_key, setting_value, updated_at)
VALUES ('snap-on-receipt', 'payment_source', 'listener', NOW())
ON CONFLICT (booth_id, setting_key) DO NOTHING;
