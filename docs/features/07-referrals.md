# Referrals

## Overview

The Referrals system implements two early access programs: **Origin 1000** (first 1000 users) and **Vanguard 300** (first 300 users with 3+ referrals). Users earn referral codes, invite others, and unlock rewards including wallet coins and free subscription months.

## Technical Architecture

### Referral Models

```prisma
model ReferralProgram {
  id                Int      @id @default(autoincrement())
  name              String   @unique // "Origin 1000" or "Vanguard 300"
  description       String?
  totalSeats        Int      // 1000 for Origin, 300 for Vanguard
  requiredReferrals Int      @default(0) // 0 for Origin, 3 for Vanguard
  isActive          Boolean  @default(true)
}

model UserReferralStatus {
  id                Int               @id @default(autoincrement())
  userId            Int               @unique
  earlyAccessStatus EarlyAccessStatus @default(NONE)
  referralCode      String            @unique // Unique 10-character code
  rewardsUnlocked   Boolean           @default(false)
  originId          String?           @unique // Format: ORG-001
  vanguardId        String?           @unique // Format: VNG-001
}

enum EarlyAccessStatus {
  NONE
  ORIGIN
  VANGUARD
}

model Referral {
  id           Int            @id @default(autoincrement())
  referrerId   Int            // User who made the referral
  referredId   Int            @unique // User who was referred
  referralCode String         // Referral code used
  status       ReferralStatus @default(INVITED)
  completedAt  DateTime?      // When onboarding completed
}

enum ReferralStatus {
  INVITED    // User signed up with referral code
  REGISTERED // User registered but hasn't completed onboarding
  COMPLETED  // User completed first billing cycle
}
```

### Key Features

#### 1. Referral Code Generation

Each user gets a unique 10-character referral code on registration:

```typescript
async generateReferralCode(userId: number): Promise<string> {
  // Generate unique 10-character code
  const code = generateUniqueCode(10);
  
  // Ensure uniqueness
  const existing = await prisma.userReferralStatus.findUnique({
    where: { referralCode: code },
  });

  if (existing) {
    // Retry with new code
    return this.generateReferralCode(userId);
  }

  // Create or update user referral status
  await prisma.userReferralStatus.upsert({
    where: { userId },
    update: { referralCode: code },
    create: {
      userId,
      referralCode: code,
      earlyAccessStatus: "NONE",
    },
  });

  return code;
}
```

#### 2. Referral Registration

When a user signs up with a referral code:

```typescript
async registerReferral(userId: number, referralCode: string): Promise<{
  success: boolean;
  referralId?: number;
  message?: string;
}> {
  // Find referrer by code
  const referrerStatus = await prisma.userReferralStatus.findUnique({
    where: { referralCode },
    include: { user: true },
  });

  if (!referrerStatus) {
    return { success: false, message: "Invalid referral code" };
  }

  // Check if user was already referred
  const existingReferral = await prisma.referral.findUnique({
    where: { referredId: userId },
  });

  if (existingReferral) {
    return { success: false, message: "User already referred" };
  }

  // Create referral record
  const referral = await prisma.referral.create({
    data: {
      referrerId: referrerStatus.userId,
      referredId: userId,
      referralCode,
      status: "INVITED",
    },
  });

  // Generate referral code for new user
  await this.generateReferralCode(userId);

  return { success: true, referralId: referral.id };
}
```

#### 3. Origin 1000 Status Assignment

Origin status is assigned when a user makes their first payment:

```typescript
async assignOriginStatus(userId: number): Promise<{
  success: boolean;
  message?: string;
}> {
  return await prisma.$transaction(async (tx) => {
    // Check current Origin seat count with lock
    const originCount = await tx.userReferralStatus.count({
      where: {
        earlyAccessStatus: {
          in: ["ORIGIN", "VANGUARD"], // Both count toward 1000 limit
        },
      },
    });

    if (originCount >= 1000) {
      return { success: false, message: "Origin 1000 seats are full" };
    }

    // Get or create user referral status
    let userStatus = await tx.userReferralStatus.findUnique({
      where: { userId },
    });

    if (!userStatus) {
      // Create with referral code
      const referralCode = await this.generateReferralCode(userId);
      userStatus = await tx.userReferralStatus.create({
        data: {
          userId,
          referralCode,
          earlyAccessStatus: "ORIGIN",
          originId: `ORG-${(originCount + 1).toString().padStart(3, "0")}`,
        },
      });
    } else if (userStatus.earlyAccessStatus === "NONE") {
      // Assign Origin ID
      const originId = `ORG-${(originCount + 1).toString().padStart(3, "0")}`;
      await tx.userReferralStatus.update({
        where: { userId },
        data: {
          earlyAccessStatus: "ORIGIN",
          originId,
        },
      });
    }

    return { success: true };
  });
}
```

#### 4. Vanguard 300 Status Assignment

Vanguard status requires 3+ completed referrals:

```typescript
async assignVanguardStatus(userId: number): Promise<{
  success: boolean;
  message?: string;
}> {
  return await prisma.$transaction(async (tx) => {
    // Check referral count
    const completedReferrals = await tx.referral.count({
      where: {
        referrerId: userId,
        status: "COMPLETED",
      },
    });

    if (completedReferrals < 3) {
      return { success: false, message: "Need 3+ completed referrals" };
    }

    // Check Vanguard seat count
    const vanguardCount = await tx.userReferralStatus.count({
      where: { earlyAccessStatus: "VANGUARD" },
    });

    if (vanguardCount >= 300) {
      return { success: false, message: "Vanguard 300 seats are full" };
    }

    // Get user status
    const userStatus = await tx.userReferralStatus.findUnique({
      where: { userId },
    });

    if (!userStatus) {
      return { success: false, message: "User referral status not found" };
    }

    // Assign Vanguard ID (user can have both Origin and Vanguard IDs)
    const rank = vanguardCount + 1;
    const vanguardId = `VNG-${rank.toString().padStart(3, "0")}`;

    // Keep original Origin ID and status if exists
    let originId = userStatus.originId;
    let statusToKeep = userStatus.earlyAccessStatus;

    if (!originId) {
      // Assign Origin ID if doesn't exist
      const originCount = await tx.userReferralStatus.count({
        where: {
          earlyAccessStatus: { in: ["ORIGIN", "VANGUARD"] },
        },
      });
      originId = `ORG-${(originCount + 1).toString().padStart(3, "0")}`;
      if (statusToKeep === "NONE") {
        statusToKeep = "ORIGIN";
      }
    }

    // Update: Add Vanguard ID but keep original status (first one earned)
    await tx.userReferralStatus.update({
      where: { userId },
      data: {
        vanguardId,
        originId, // Keep or assign Origin ID
        // Keep original earlyAccessStatus (ORIGIN or NONE)
        // Vanguard is additional, not replacement
      },
    });

    return { success: true };
  });
}
```

#### 5. Referral Completion

A referral is marked as COMPLETED when the referred user completes their first billing cycle:

```typescript
async completeReferralOnboarding(userId: number): Promise<{
  success: boolean;
  referrerStatusUpdated?: boolean;
  newReferrerStatus?: string;
}> {
  // Find referral where this user was referred
  const referral = await prisma.referral.findUnique({
    where: { referredId: userId },
    include: { referrer: true },
  });

  if (!referral) {
    return { success: false }; // User wasn't referred
  }

  if (referral.status === "COMPLETED") {
    return { success: true }; // Already completed
  }

  // Mark referral as completed
  await prisma.referral.update({
    where: { id: referral.id },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
    },
  });

  // Award coins to referrer (100 coins per completed referral)
  await walletService.awardCoins(
    referral.referrerId,
    100,
    "REFERRAL",
    `Referral completed: ${referral.referred.email}`,
    { referralId: referral.id, referredUserId: userId }
  );

  // Check if referrer qualifies for Vanguard
  const completedCount = await prisma.referral.count({
    where: {
      referrerId: referral.referrerId,
      status: "COMPLETED",
    },
  });

  let referrerStatusUpdated = false;
  let newReferrerStatus = null;

  if (completedCount >= 3) {
    // Assign Vanguard status
    const result = await statusAssignmentService.assignVanguardStatus(referral.referrerId);
    if (result.success) {
      referrerStatusUpdated = true;
      newReferrerStatus = "VANGUARD";
      
      // Award additional coins for Vanguard qualification (500 coins)
      await walletService.awardCoins(
        referral.referrerId,
        500,
        "REFERRAL",
        "Vanguard 300 qualification bonus",
        { vanguardQualification: true }
      );
    }
  }

  return {
    success: true,
    referrerStatusUpdated,
    newReferrerStatus,
  };
}
```

#### 6. Referral Statistics

```typescript
async getReferralStats(userId: number) {
  const [totalReferrals, completedReferrals] = await Promise.all([
    prisma.referral.count({
      where: { referrerId: userId },
    }),
    prisma.referral.count({
      where: {
        referrerId: userId,
        status: "COMPLETED",
      },
    }),
  ]);

  const requiredReferrals = 3;
  const progress = completedReferrals / requiredReferrals;
  const progressPercentage = Math.min(100, Math.round(progress * 100));

  const userStatus = await prisma.userReferralStatus.findUnique({
    where: { userId },
  });

  const isVanguardQualified = completedReferrals >= requiredReferrals;
  const isVanguard = userStatus?.earlyAccessStatus === "VANGUARD";
  const isOrigin = userStatus?.earlyAccessStatus === "ORIGIN" || isVanguard;

  return {
    totalReferrals,
    completedReferrals,
    requiredReferrals,
    progress,
    progressPercentage,
    isVanguardQualified,
    isVanguard,
    isOrigin,
    referralCode: userStatus?.referralCode,
    originId: userStatus?.originId,
    vanguardId: userStatus?.vanguardId,
  };
}
```

### Integration Points

1. **Registration**: Referral code registration during signup
2. **Subscription Service**: Origin status assignment on first payment
3. **Wallet Service**: Coin rewards for completed referrals
4. **Status Assignment Service**: Vanguard status assignment logic

### API Endpoints

- `GET /api/referrals/status` - Get user referral status and stats
- `GET /api/referrals/code` - Get user's referral code
- `POST /api/referrals/register` - Register referral (during signup)
- `GET /api/referrals/invitations` - Get referral invitations sent
- `GET /api/referrals/stats` - Get referral statistics

### Important Code Snippets

**Referral Code Generation:**
```typescript
function generateUniqueCode(length: number): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
```

**Status Check:**
```typescript
// Check if user qualifies for Vanguard
const completedReferrals = await prisma.referral.count({
  where: {
    referrerId: userId,
    status: "COMPLETED",
  },
});

if (completedReferrals >= 3) {
  await statusAssignmentService.assignVanguardStatus(userId);
}
```

### Rewards System

**Referrer Rewards:**
- 100 coins per completed referral
- 500 coins bonus for Vanguard 300 qualification
- Up to 3 free subscription months (from completed referrals)

**Referred User Benefits:**
- Access to Origin 1000 or Vanguard 300 programs
- Early access features
- Badge/status recognition

### Error Handling

- **400 Bad Request**: Invalid referral code, user already referred
- **403 Forbidden**: Unauthorized access
- **404 Not Found**: Referral not found
- **500 Internal Server Error**: Database errors

### Testing Considerations

1. Test referral code generation uniqueness
2. Test referral registration flow
3. Test Origin 1000 seat limit (1000)
4. Test Vanguard 300 seat limit (300)
5. Test referral completion logic
6. Test coin rewards distribution
7. Test status assignment transactions

