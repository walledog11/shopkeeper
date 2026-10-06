-- Hand-written: the first model call's 1h cache write, so a turn that opened on
-- a cold cache can be told apart from one that rebuilt its cached prefix
-- mid-turn. Nullable because earlier rows never measured it. Additive only; safe
-- to apply before the writer ships.
ALTER TABLE "agent_turn_usage" ADD COLUMN "first_call_cache_creation_1h_input_tokens" INTEGER;
