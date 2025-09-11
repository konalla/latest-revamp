-- CreateTable
CREATE TABLE "public"."Task" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "priority" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "importance" BOOLEAN NOT NULL DEFAULT false,
    "urgency" BOOLEAN NOT NULL DEFAULT false,
    "userId" INTEGER NOT NULL,
    "projectId" INTEGER,
    "objectiveId" INTEGER,
    "okrId" INTEGER,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_objectiveId_fkey" FOREIGN KEY ("objectiveId") REFERENCES "public"."Objective"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Task" ADD CONSTRAINT "Task_okrId_fkey" FOREIGN KEY ("okrId") REFERENCES "public"."Okr"("id") ON DELETE CASCADE ON UPDATE CASCADE;
