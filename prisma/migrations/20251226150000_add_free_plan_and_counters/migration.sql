-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN IF NOT EXISTS "maxProjects" INTEGER,
ADD COLUMN IF NOT EXISTS "maxObjectives" INTEGER,
ADD COLUMN IF NOT EXISTS "maxKeyResults" INTEGER,
ADD COLUMN IF NOT EXISTS "maxWorkspaces" INTEGER,
ADD COLUMN IF NOT EXISTS "maxTeams" INTEGER;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "projectsCreatedThisPeriod" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "objectivesCreatedThisPeriod" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "keyResultsCreatedThisPeriod" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "workspacesCreatedThisPeriod" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "teamsCreatedThisPeriod" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "lastCountReset" TIMESTAMP(3);

-- AlterTable
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Subscription' 
        AND column_name = 'paymentProviderId' 
        AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE "Subscription" ALTER COLUMN "paymentProviderId" DROP NOT NULL;
    END IF;
END $$;

