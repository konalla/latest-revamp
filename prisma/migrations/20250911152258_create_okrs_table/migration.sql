-- CreateTable
CREATE TABLE "public"."Okr" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'notStarted',
    "targetValue" DOUBLE PRECISION NOT NULL,
    "currentValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" INTEGER NOT NULL,
    "objectiveId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "confidenceScore" INTEGER NOT NULL DEFAULT 3,
    "keyResults" JSONB NOT NULL DEFAULT '[]',
    "progressHistory" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "Okr_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."Okr" ADD CONSTRAINT "Okr_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Okr" ADD CONSTRAINT "Okr_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "public"."Objective"("id") ON DELETE CASCADE ON UPDATE CASCADE;
