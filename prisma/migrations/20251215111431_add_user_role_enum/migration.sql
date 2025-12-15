-- Step 1: Create UserRole enum
CREATE TYPE "public"."UserRole" AS ENUM ('USER', 'ADMIN');

-- Step 2: Add a temporary column with the new enum type
ALTER TABLE "public"."User" ADD COLUMN "role_new" "public"."UserRole" NOT NULL DEFAULT 'USER';

-- Step 3: Convert existing role values to enum
-- Convert "user" or any lowercase/uppercase variation to USER
-- Convert "admin" or any lowercase/uppercase variation to ADMIN
-- Default to USER for any other values
UPDATE "public"."User" 
SET "role_new" = CASE 
  WHEN LOWER(TRIM("role")) = 'admin' THEN 'ADMIN'::"public"."UserRole"
  WHEN LOWER(TRIM("role")) = 'user' THEN 'USER'::"public"."UserRole"
  ELSE 'USER'::"public"."UserRole"
END;

-- Step 4: Drop the old column
ALTER TABLE "public"."User" DROP COLUMN "role";

-- Step 5: Rename the new column to the original name
ALTER TABLE "public"."User" RENAME COLUMN "role_new" TO "role";

-- Step 6: Set default value
ALTER TABLE "public"."User" ALTER COLUMN "role" SET DEFAULT 'USER';

