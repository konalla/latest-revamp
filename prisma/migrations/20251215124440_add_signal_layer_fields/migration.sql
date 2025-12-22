-- AlterTable Task - Add Signal Layer fields
ALTER TABLE "public"."Task" ADD COLUMN     "advancesKeyResults" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isHighLeverage" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable AIRecommendation - Add enhanced Signal Layer fields
ALTER TABLE "public"."AIRecommendation" ADD COLUMN     "signalType" TEXT,
ADD COLUMN     "recommendedDuration" INTEGER,
ADD COLUMN     "breakRecommendation" TEXT,
ADD COLUMN     "loadWarning" TEXT,
ADD COLUMN     "importanceFlag" BOOLEAN,
ADD COLUMN     "urgencyFlag" BOOLEAN;
