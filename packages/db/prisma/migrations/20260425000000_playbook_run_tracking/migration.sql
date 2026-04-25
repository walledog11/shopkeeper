-- AlterTable: add run_count to playbooks
ALTER TABLE "playbooks" ADD COLUMN "run_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: playbook_runs (deduplication + audit)
CREATE TABLE "playbook_runs" (
    "id" UUID NOT NULL,
    "playbook_id" UUID NOT NULL,
    "thread_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playbook_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "playbook_runs_playbook_id_thread_id_key" ON "playbook_runs"("playbook_id", "thread_id");

-- AddForeignKey
ALTER TABLE "playbook_runs" ADD CONSTRAINT "playbook_runs_playbook_id_fkey" FOREIGN KEY ("playbook_id") REFERENCES "playbooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playbook_runs" ADD CONSTRAINT "playbook_runs_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
