-- CreateEnum
CREATE TYPE "public"."FocusRoomVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- CreateEnum
CREATE TYPE "public"."FocusSessionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "public"."FocusParticipantRole" AS ENUM ('CREATOR', 'PARTICIPANT');

-- CreateEnum
CREATE TYPE "public"."FocusParticipantStatus" AS ENUM ('JOINED', 'FOCUSING', 'BREAK', 'IDLE', 'LEFT');

-- CreateEnum
CREATE TYPE "public"."InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "public"."RoomTemplateCategory" AS ENUM ('DEEP_WORK', 'CREATIVE', 'PLANNING', 'LEARNING', 'CUSTOM');

-- CreateTable
CREATE TABLE "public"."focus_rooms" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "description" VARCHAR(500),
    "creator_id" INTEGER NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "visibility" "public"."FocusRoomVisibility" NOT NULL DEFAULT 'PUBLIC',
    "focus_duration" INTEGER NOT NULL DEFAULT 25,
    "break_duration" INTEGER NOT NULL DEFAULT 5,
    "allow_observers" BOOLEAN NOT NULL DEFAULT true,
    "password_hash" VARCHAR(100),
    "requires_password" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB DEFAULT '{}',
    "scheduled_start_time" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "focus_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."focus_room_sessions" (
    "id" SERIAL NOT NULL,
    "room_id" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "paused_at" TIMESTAMP(3),
    "resumed_at" TIMESTAMP(3),
    "scheduled_duration" INTEGER NOT NULL,
    "actual_duration" INTEGER,
    "status" "public"."FocusSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "focus_room_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."focus_room_participants" (
    "id" SERIAL NOT NULL,
    "room_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" "public"."FocusParticipantRole" NOT NULL DEFAULT 'PARTICIPANT',
    "status" "public"."FocusParticipantStatus" NOT NULL DEFAULT 'JOINED',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "left_at" TIMESTAMP(3),
    "intention" TEXT,
    "completion" TEXT,
    "share_completion" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "focus_room_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."focus_room_invitations" (
    "id" SERIAL NOT NULL,
    "room_id" INTEGER NOT NULL,
    "inviter_id" INTEGER NOT NULL,
    "invitee_id" INTEGER,
    "invitee_email" VARCHAR(255) NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "status" "public"."InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "responded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "focus_room_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."focus_room_templates" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "creator_id" INTEGER NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "category" "public"."RoomTemplateCategory" NOT NULL DEFAULT 'CUSTOM',
    "focus_duration" INTEGER NOT NULL DEFAULT 25,
    "break_duration" INTEGER NOT NULL DEFAULT 5,
    "allow_observers" BOOLEAN NOT NULL DEFAULT true,
    "visibility" "public"."FocusRoomVisibility" NOT NULL DEFAULT 'PUBLIC',
    "settings" JSONB DEFAULT '{}',
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "focus_room_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "focus_rooms_status_visibility_idx" ON "public"."focus_rooms"("status", "visibility");

-- CreateIndex
CREATE INDEX "focus_rooms_creator_id_idx" ON "public"."focus_rooms"("creator_id");

-- CreateIndex
CREATE INDEX "focus_room_sessions_room_id_status_idx" ON "public"."focus_room_sessions"("room_id", "status");

-- CreateIndex
CREATE INDEX "focus_room_sessions_started_at_idx" ON "public"."focus_room_sessions"("started_at");

-- CreateIndex
CREATE UNIQUE INDEX "focus_room_participants_room_user_idx" ON "public"."focus_room_participants"("room_id", "user_id");

-- CreateIndex
CREATE INDEX "focus_room_participants_room_id_status_idx" ON "public"."focus_room_participants"("room_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "focus_room_invitations_token_key" ON "public"."focus_room_invitations"("token");

-- CreateIndex
CREATE INDEX "focus_room_invitations_token_idx" ON "public"."focus_room_invitations"("token");

-- CreateIndex
CREATE INDEX "focus_room_invitations_room_id_status_idx" ON "public"."focus_room_invitations"("room_id", "status");

-- CreateIndex
CREATE INDEX "focus_room_invitations_invitee_email_status_idx" ON "public"."focus_room_invitations"("invitee_email", "status");

-- CreateIndex
CREATE INDEX "focus_room_templates_category_is_system_idx" ON "public"."focus_room_templates"("category", "is_system");

-- AddForeignKey
ALTER TABLE "public"."focus_rooms" ADD CONSTRAINT "focus_rooms_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."focus_room_sessions" ADD CONSTRAINT "focus_room_sessions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."focus_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."focus_room_participants" ADD CONSTRAINT "focus_room_participants_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."focus_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."focus_room_participants" ADD CONSTRAINT "focus_room_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."focus_room_invitations" ADD CONSTRAINT "focus_room_invitations_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."focus_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."focus_room_invitations" ADD CONSTRAINT "focus_room_invitations_inviter_id_fkey" FOREIGN KEY ("inviter_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."focus_room_invitations" ADD CONSTRAINT "focus_room_invitations_invitee_id_fkey" FOREIGN KEY ("invitee_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."focus_room_templates" ADD CONSTRAINT "focus_room_templates_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
