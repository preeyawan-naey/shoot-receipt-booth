-- The Receipt Club: Static QR booths use APK notification listener (same as Snap).

INSERT INTO booth_payment_settings (booth_id, setting_key, setting_value, updated_at)
VALUES ('the-receipt-club', 'payment_source', 'listener', NOW())
ON CONFLICT (booth_id, setting_key)
DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = EXCLUDED.updated_at;
