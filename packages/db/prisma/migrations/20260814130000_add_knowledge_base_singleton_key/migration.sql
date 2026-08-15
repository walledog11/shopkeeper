-- `Notes` is a product-owned singleton within each organization. Collapse any
-- legacy duplicates before adding the key so the migration preserves every
-- article (and, transitively, its citations) instead of deleting merchant
-- memory through the knowledge-base cascade.
ALTER TABLE "knowledge_bases"
  ADD COLUMN "singleton_key" VARCHAR(50);

UPDATE "kb_articles" AS article
SET "knowledge_base_id" = canonical."id"
FROM "knowledge_bases" AS duplicate
CROSS JOIN LATERAL (
  SELECT candidate."id"
  FROM "knowledge_bases" AS candidate
  WHERE candidate."organization_id" = duplicate."organization_id"
    AND candidate."source" = 'user'
    AND lower(btrim(candidate."name")) = 'notes'
  ORDER BY candidate."created_at" ASC, candidate."id" ASC
  LIMIT 1
) AS canonical
WHERE article."knowledge_base_id" = duplicate."id"
  AND duplicate."source" = 'user'
  AND lower(btrim(duplicate."name")) = 'notes'
  AND duplicate."id" <> canonical."id";

DELETE FROM "knowledge_bases" AS duplicate
WHERE duplicate."source" = 'user'
  AND lower(btrim(duplicate."name")) = 'notes'
  AND EXISTS (
    SELECT 1
    FROM "knowledge_bases" AS earlier
    WHERE earlier."organization_id" = duplicate."organization_id"
      AND earlier."source" = 'user'
      AND lower(btrim(earlier."name")) = 'notes'
      AND (earlier."created_at", earlier."id") < (duplicate."created_at", duplicate."id")
  );

UPDATE "knowledge_bases"
SET "name" = 'Notes', "singleton_key" = 'user:notes'
WHERE "source" = 'user'
  AND lower(btrim("name")) = 'notes';

-- Keep the denormalized key honest for every write path, including older app
-- versions during a rolling deploy. NULL remains available for ordinary,
-- intentionally non-unique knowledge bases.
ALTER TABLE "knowledge_bases"
  ADD CONSTRAINT "knowledge_bases_singleton_key_check"
  CHECK (
    ("singleton_key" IS NULL AND NOT ("source" = 'user' AND lower(btrim("name")) = 'notes'))
    OR
    ("singleton_key" = 'user:notes' AND "source" = 'user' AND lower(btrim("name")) = 'notes')
  );

CREATE UNIQUE INDEX "knowledge_bases_organization_id_singleton_key_key"
  ON "knowledge_bases"("organization_id", "singleton_key");
