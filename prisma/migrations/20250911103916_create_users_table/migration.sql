-- CreateTable
CREATE TABLE "public"."User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'user',
    "phone_number" TEXT,
    "company_name" TEXT,
    "website" TEXT,
    "profile_photo_url" TEXT,
    "job_title" TEXT,
    "industry" TEXT,
    "bio" TEXT,
    "timezone" TEXT,
    "linkedin_url" TEXT,
    "website_url" TEXT,
    "secondary_social_url" TEXT,
    "secondary_social_type" TEXT,
    "preferred_working_hours" JSONB NOT NULL DEFAULT '{}',
    "communication_preference" TEXT,
    "primary_work_focus" TEXT,
    "profile_completion_percentage" INTEGER NOT NULL DEFAULT 20,
    "last_profile_update" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "credits" INTEGER NOT NULL DEFAULT 100,
    "credit_refresh_period" TEXT NOT NULL DEFAULT 'monthly',
    "credit_refresh_amount" INTEGER NOT NULL DEFAULT 100,
    "last_credit_refresh" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");
