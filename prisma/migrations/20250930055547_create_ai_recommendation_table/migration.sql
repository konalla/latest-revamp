-- CreateTable
CREATE TABLE "public"."AIRecommendation" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "recommendedTime" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reasoning" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AIRecommendation_taskId_key" ON "public"."AIRecommendation"("taskId");

-- AddForeignKey
ALTER TABLE "public"."AIRecommendation" ADD CONSTRAINT "AIRecommendation_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
