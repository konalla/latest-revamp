-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "is_online" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "status_updated_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_is_online_idx" ON "public"."User"("is_online");

-- CreateIndex
CREATE INDEX "User_status_updated_at_idx" ON "public"."User"("status_updated_at");
