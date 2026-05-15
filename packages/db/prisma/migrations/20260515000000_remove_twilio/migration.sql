-- Remove Twilio-era columns and tables. OperatorContext loses `channel` (always
-- 'telegram' now). OrgMember loses phone columns. Legacy sms_contexts is dropped.

DROP INDEX IF EXISTS "operator_contexts_organization_id_channel_chat_id_key";

DELETE FROM "operator_contexts" WHERE "channel" <> 'telegram';

ALTER TABLE "operator_contexts" DROP COLUMN "channel";

CREATE UNIQUE INDEX "operator_contexts_organization_id_chat_id_key"
    ON "operator_contexts"("organization_id", "chat_id");

DROP INDEX IF EXISTS "org_members_organization_id_phone_number_key";
DROP INDEX IF EXISTS "org_members_phone_number_idx";

ALTER TABLE "org_members" DROP COLUMN IF EXISTS "phone_number";
ALTER TABLE "org_members" DROP COLUMN IF EXISTS "phone_verified";

DROP TABLE IF EXISTS "sms_contexts";
