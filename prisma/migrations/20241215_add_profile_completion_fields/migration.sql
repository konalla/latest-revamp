-- AddMissingColumns
ALTER TABLE "public"."User" ADD COLUMN "company_size" TEXT;
ALTER TABLE "public"."User" ADD COLUMN "company_description" TEXT;
ALTER TABLE "public"."User" ADD COLUMN "founded_year" INTEGER;
ALTER TABLE "public"."User" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
