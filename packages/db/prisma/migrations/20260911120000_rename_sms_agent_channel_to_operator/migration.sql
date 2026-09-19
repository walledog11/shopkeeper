-- `sms_agent` was never SMS. It is the merchant's own operator thread, and it
-- carries Telegram and iMessage both, so the name described neither the
-- transport nor the thing. Renamed in place: RENAME VALUE keeps every existing
-- row pointing at the same value, so no backfill is needed (4 rows in
-- production at the time of writing).
ALTER TYPE "ChannelType" RENAME VALUE 'sms_agent' TO 'operator';
