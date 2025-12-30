-- DropForeignKey
ALTER TABLE "public"."Subscription" DROP CONSTRAINT "Subscription_paymentProviderId_fkey";

-- CreateTable
CREATE TABLE "public"."recurring_schedules" (
    "id" SERIAL NOT NULL,
    "room_id" INTEGER NOT NULL,
    "recurrence_type" VARCHAR(20) NOT NULL,
    "days_of_week" INTEGER[],
    "time" VARCHAR(5) NOT NULL,
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'UTC',
    "start_date" TIMESTAMP(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."recurring_session_occurrences" (
    "id" SERIAL NOT NULL,
    "recurring_schedule_id" INTEGER NOT NULL,
    "scheduled_time" TIMESTAMP(3) NOT NULL,
    "session_id" INTEGER,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "skip_reason" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_session_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "recurring_schedules_room_id_key" ON "public"."recurring_schedules"("room_id");

-- CreateIndex
CREATE INDEX "recurring_schedules_is_active_start_date_idx" ON "public"."recurring_schedules"("is_active", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_session_occurrences_session_id_key" ON "public"."recurring_session_occurrences"("session_id");

-- CreateIndex
CREATE INDEX "recurring_session_occurrences_scheduled_time_status_idx" ON "public"."recurring_session_occurrences"("scheduled_time", "status");

-- CreateIndex
CREATE INDEX "recurring_session_occurrences_recurring_schedule_id_idx" ON "public"."recurring_session_occurrences"("recurring_schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_session_occurrences_recurring_schedule_id_schedul_key" ON "public"."recurring_session_occurrences"("recurring_schedule_id", "scheduled_time");

-- AddForeignKey
ALTER TABLE "public"."Subscription" ADD CONSTRAINT "Subscription_paymentProviderId_fkey" FOREIGN KEY ("paymentProviderId") REFERENCES "public"."PaymentProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."recurring_schedules" ADD CONSTRAINT "recurring_schedules_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."focus_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."recurring_session_occurrences" ADD CONSTRAINT "recurring_session_occurrences_recurring_schedule_id_fkey" FOREIGN KEY ("recurring_schedule_id") REFERENCES "public"."recurring_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."recurring_session_occurrences" ADD CONSTRAINT "recurring_session_occurrences_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."focus_room_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "public"."focus_room_participants_room_user_idx" RENAME TO "focus_room_participants_room_id_user_id_key";
