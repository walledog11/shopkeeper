-- Phase 2 of the Concierge/operator unification: operator state is keyed to the
-- *person*, not the transport.
--
-- Before: one durable operator thread and one pending-plan ledger per binding
-- ref (`telegram:<chatId>` / `imessage:<senderId>`), plus an orphan
-- `dashboard:<clerkUserId>` ledger. A merchant with two bindings therefore had
-- two memories and two ledgers, and approving on one left the other showing the
-- plan as still pending.
--
-- After: `member:<orgMemberId>` is the single key for both, so every transport
-- reads and writes the same thread and the same queue.

-- The context key is the member, so the column name stops claiming otherwise.
ALTER TABLE "operator_contexts" RENAME COLUMN "chat_id" TO "member_key";
ALTER INDEX "operator_contexts_organization_id_chat_id_key"
  RENAME TO "operator_contexts_organization_id_member_key_key";

-- Backfill. Per org member: elect one operator thread, fold the siblings'
-- conversation into it, and merge every ledger row into one.
--
-- Moving messages is safe because operator threads are pure chat logs — nothing
-- pins their messages to a thread. `threads.cached_plan_message_id` and
-- `plan_executions.source_message_id` both reference *ticket* threads, and the
-- loser's cached-plan pointer is cleared below regardless. If this migration
-- fails on `threads_tenant_cached_plan_message_fkey` or
-- `plan_executions_tenant_source_message_thread_fkey`, an operator thread has
-- picked up a shape that assumption does not cover — investigate rather than
-- forcing it through.
DO $$
DECLARE
  mbr RECORD;
  v_member_key TEXT;
  thread_refs TEXT[];
  ledger_keys TEXT[];
  winner_id UUID;
  loser_ids UUID[];
  merged_plans JSONB;
  merged_question JSONB;
  merged_digest JSONB;
BEGIN
  FOR mbr IN SELECT id, organization_id, clerk_user_id FROM org_members LOOP
    v_member_key := 'member:' || mbr.id::text;

    -- Every ref this person's threads may be keyed by today.
    SELECT COALESCE(array_agg(ref), ARRAY[]::TEXT[]) INTO thread_refs FROM (
      SELECT 'telegram:' || chat_id AS ref
        FROM org_member_telegram_chats WHERE org_member_id = mbr.id
      UNION
      SELECT 'imessage:' || sender_id
        FROM org_member_imessage_bindings WHERE org_member_id = mbr.id
    ) refs;

    -- Ledger rows were keyed by the bare transport id, plus the Concierge's own
    -- namespaced key from Phase 1.
    SELECT COALESCE(array_agg(k), ARRAY[]::TEXT[]) INTO ledger_keys FROM (
      SELECT chat_id AS k FROM org_member_telegram_chats WHERE org_member_id = mbr.id
      UNION
      SELECT sender_id FROM org_member_imessage_bindings WHERE org_member_id = mbr.id
      UNION
      SELECT 'dashboard:' || mbr.clerk_user_id
    ) keys;

    ------------------------------------------------------------------ threads
    IF array_length(thread_refs, 1) > 0 THEN
      -- Candidates include pre-Phase-B threads, which predate operator_key and
      -- are identified by the operator customer they hang off instead.
      SELECT t.id INTO winner_id
      FROM threads t
      JOIN customers c ON c.id = t.customer_id
      WHERE t.organization_id = mbr.organization_id
        AND t.deleted_at IS NULL
        AND (
          t.operator_key = ANY(thread_refs)
          OR (
            t.operator_key IS NULL
            AND t.channel_type = 'sms_agent'
            AND t.status = 'open'
            AND c.platform_id = ANY(thread_refs)
          )
        )
      ORDER BY t.last_message_at DESC, t.created_at DESC, t.id
      LIMIT 1;

      IF winner_id IS NOT NULL THEN
        SELECT COALESCE(array_agg(t.id), ARRAY[]::UUID[]) INTO loser_ids
        FROM threads t
        JOIN customers c ON c.id = t.customer_id
        WHERE t.organization_id = mbr.organization_id
          AND t.deleted_at IS NULL
          AND t.id <> winner_id
          AND (
            t.operator_key = ANY(thread_refs)
            OR (
              t.operator_key IS NULL
              AND t.channel_type = 'sms_agent'
              AND t.status = 'open'
              AND c.platform_id = ANY(thread_refs)
            )
          );

        IF array_length(loser_ids, 1) > 0 THEN
          UPDATE threads
          SET cached_plan_message_id = NULL, cached_plan = NULL
          WHERE id = ANY(loser_ids);

          UPDATE messages SET thread_id = winner_id WHERE thread_id = ANY(loser_ids);

          -- Retired, not deleted: the merchant keeps the record, and a freed
          -- operator_key cannot collide with the winner's new one.
          UPDATE threads
          SET operator_key = NULL, status = 'closed', archived_at = now(), updated_at = now()
          WHERE id = ANY(loser_ids);
        END IF;

        UPDATE threads t
        SET operator_key = v_member_key,
            updated_at = now(),
            last_message_at = COALESCE(m.last_sent_at, t.last_message_at),
            last_message_sender_type = COALESCE(m.last_sender_type, t.last_message_sender_type)
        FROM (
          SELECT
            MAX(sent_at) AS last_sent_at,
            (SELECT sender_type FROM messages
             WHERE thread_id = winner_id AND deleted_at IS NULL
             ORDER BY sent_at DESC, id DESC LIMIT 1) AS last_sender_type
          FROM messages WHERE thread_id = winner_id AND deleted_at IS NULL
        ) m
        WHERE t.id = winner_id;
      END IF;
    END IF;

    ------------------------------------------------------------------ ledgers
    merged_plans := '[]'::jsonb;
    merged_question := NULL;
    merged_digest := NULL;

    -- Newest-last queue, at most one entry per ticket thread; when both
    -- transports hold a plan for the same ticket the more recent row wins.
    WITH src AS (
      SELECT
        updated_at,
        COALESCE(
          pending_plans,
          CASE WHEN pending_plan IS NOT NULL THEN jsonb_build_array(pending_plan) ELSE '[]'::jsonb END
        ) AS plans
      FROM operator_contexts
      WHERE organization_id = mbr.organization_id AND member_key = ANY(ledger_keys)
    ),
    flat AS (
      SELECT src.updated_at, element.ord, element.plan
      FROM src, LATERAL jsonb_array_elements(src.plans) WITH ORDINALITY AS element(plan, ord)
    ),
    deduped AS (
      SELECT DISTINCT ON (plan->>'threadId') plan, updated_at, ord
      FROM flat
      WHERE plan->>'threadId' IS NOT NULL
      ORDER BY plan->>'threadId', updated_at DESC, ord DESC
    )
    SELECT COALESCE(jsonb_agg(plan ORDER BY updated_at, ord), '[]'::jsonb)
    INTO merged_plans FROM deduped;

    SELECT pending_question INTO merged_question
    FROM operator_contexts
    WHERE organization_id = mbr.organization_id
      AND member_key = ANY(ledger_keys)
      AND pending_question IS NOT NULL
    ORDER BY updated_at DESC LIMIT 1;

    SELECT pending_digest INTO merged_digest
    FROM operator_contexts
    WHERE organization_id = mbr.organization_id
      AND member_key = ANY(ledger_keys)
      AND pending_digest IS NOT NULL
    ORDER BY updated_at DESC LIMIT 1;

    DELETE FROM operator_contexts
    WHERE organization_id = mbr.organization_id AND member_key = ANY(ledger_keys);

    IF merged_plans <> '[]'::jsonb OR merged_question IS NOT NULL OR merged_digest IS NOT NULL THEN
      INSERT INTO operator_contexts
        (id, organization_id, member_key, pending_plans, pending_question, pending_digest, updated_at)
      VALUES (
        gen_random_uuid(),
        mbr.organization_id,
        v_member_key,
        NULLIF(merged_plans, '[]'::jsonb),
        merged_question,
        merged_digest,
        now()
      );
    END IF;
  END LOOP;
END $$;

-- Rows left under a transport key belong to no current member (an unbound chat,
-- or a binding removed before this ran). Nothing reads them after this migration;
-- they are kept rather than deleted because they cannot be attributed to a person.
