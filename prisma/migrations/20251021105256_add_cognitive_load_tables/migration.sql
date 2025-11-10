-- CreateTable
CREATE TABLE "public"."cognitive_load_meters" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "current_workload_score" INTEGER NOT NULL DEFAULT 50,
    "cognitive_capacity" INTEGER NOT NULL DEFAULT 100,
    "sustainable_capacity" INTEGER NOT NULL DEFAULT 75,
    "burnout_risk_score" INTEGER NOT NULL DEFAULT 0,
    "burnout_risk_level" TEXT NOT NULL DEFAULT 'NONE',
    "recovery_rate" INTEGER NOT NULL DEFAULT 5,
    "workload_history" JSONB NOT NULL DEFAULT '[]',
    "capacity_utilization" JSONB NOT NULL DEFAULT '[]',
    "recommended_task_limit" INTEGER,
    "recommended_focus_session_duration" INTEGER,
    "recommended_break_frequency" INTEGER,
    "current_status" TEXT NOT NULL DEFAULT 'OPTIMAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cognitive_load_meters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_productivity_patterns" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "hourly_patterns" JSONB NOT NULL DEFAULT '{}',
    "day_of_week_patterns" JSONB NOT NULL DEFAULT '{}',
    "task_switching_metrics" JSONB NOT NULL DEFAULT '{}',
    "task_completion_rate" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "average_focus_session_duration" INTEGER NOT NULL DEFAULT 25,
    "peak_productivity_hours" JSONB NOT NULL DEFAULT '[]',
    "energy_pattern" TEXT,
    "context_switching_profile" TEXT,
    "recovery_pattern" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_productivity_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_focus_preferences" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "working_hours" JSONB NOT NULL DEFAULT '{}',
    "cognitive_load_preferences" JSONB NOT NULL DEFAULT '{}',
    "preferred_focus_duration" INTEGER NOT NULL DEFAULT 25,
    "preferred_break_duration" INTEGER NOT NULL DEFAULT 5,
    "max_consecutive_sessions" INTEGER NOT NULL DEFAULT 4,
    "break_frequency" INTEGER NOT NULL DEFAULT 5,
    "deep_work_preferences" JSONB NOT NULL DEFAULT '{}',
    "environment_preferences" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_focus_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cognitive_load_meters_user_id_key" ON "public"."cognitive_load_meters"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_productivity_patterns_user_id_key" ON "public"."user_productivity_patterns"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_focus_preferences_user_id_key" ON "public"."user_focus_preferences"("user_id");

-- AddForeignKey
ALTER TABLE "public"."cognitive_load_meters" ADD CONSTRAINT "cognitive_load_meters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_productivity_patterns" ADD CONSTRAINT "user_productivity_patterns_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_focus_preferences" ADD CONSTRAINT "user_focus_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
