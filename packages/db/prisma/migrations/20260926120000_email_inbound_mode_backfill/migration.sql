-- Phase 2 steady-state: transport is implied by email_provider. Retain inboundMode
-- only on Gmail rows that explicitly disable watch (send-only OAuth + Postmark inbound).
UPDATE integrations
SET metadata = metadata - 'inboundMode'
WHERE platform = 'email'
  AND email_provider = 'postmark'
  AND metadata ? 'inboundMode';

UPDATE integrations
SET metadata = metadata - 'inboundMode'
WHERE platform = 'email'
  AND email_provider = 'gmail'
  AND metadata->>'inboundMode' IN ('hybrid', 'native');
