/*
  Warnings:

  - Added the required column `updated_at` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "company_description" TEXT,
ADD COLUMN     "company_size" TEXT,
ADD COLUMN     "founded_year" INTEGER,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- CreateTable
CREATE TABLE "public"."focus_sessions" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "session_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "intention" JSONB NOT NULL DEFAULT '{}',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "duration" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "tasks_completed" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ai_score" INTEGER,
    "distractions" INTEGER NOT NULL DEFAULT 0,
    "environment" TEXT,
    "mood" TEXT,
    "energy_level" TEXT,
    "cognitive_flow_score" INTEGER,
    "context_switch_count" INTEGER NOT NULL DEFAULT 0,
    "flow_state" TEXT,
    "task_group_effectiveness" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "focus_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "focus_sessions_user_type_status_started_at_idx" ON "public"."focus_sessions"("user_id", "session_type", "status", "started_at");

-- AddForeignKey
ALTER TABLE "public"."focus_sessions" ADD CONSTRAINT "focus_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
