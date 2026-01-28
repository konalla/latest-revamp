# Redemption

## Overview

The Redemption system allows users to redeem their wallet coins for physical items (redeemable items). The system tracks redemptions, sends webhooks to fulfillment systems, and manages redemption status.

## Technical Architecture

### Redemption Models

```prisma
model RedeemableItem {
  id              Int      @id @default(autoincrement())
  name            String   @unique // e.g., "IQniti T-shirt"
  description     String?
  imageUrl        String?  // Preview image URL
  requiredCredits Int      // Credits threshold (e.g., 200, 1500)
  isActive        Boolean  @default(true)
  sortOrder       Int      @default(0) // For display ordering
  variantOptions  Json?    @default("{}") // {"sizes": ["S", "M", "L"], "colors": ["Black", "White"]}
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  redemptions Redemption[]
}

model Redemption {
  id                Int              @id @default(autoincrement())
  userId            Int
  redeemableItemId  Int
  creditsDeducted   Int              // Amount of credits deducted
  balanceAfter      Int              // Wallet balance after redemption
  status            RedemptionStatus @default(PENDING)
  selectedVariant   Json?            @default("{}") // {"size": "M", "color": "Black"}
  webhookSent       Boolean          @default(false)
  webhookSentAt     DateTime?
  webhookRetryCount Int              @default(0)
  fulfillmentNotes  String?          // Optional notes from fulfillment team
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  user           User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  redeemableItem RedeemableItem @relation(fields: [redeemableItemId], references: [id])
  transaction    WalletTransaction? // Link to wallet transaction
}

enum RedemptionStatus {
  PENDING    // Redemption created, awaiting fulfillment
  FULFILLED  // Item has been fulfilled/shipped
  CANCELLED  // Redemption was cancelled
}
```

### Key Features

#### 1. Create Redemption

```typescript
async createRedemption(
  userId: number,
  redeemableItemId: number,
  selectedVariant?: Record<string, any>
): Promise<Redemption> {
  // Get redeemable item
  const redeemableItem = await prisma.redeemableItem.findUnique({
    where: { id: redeemableItemId },
  });

  if (!redeemableItem || !redeemableItem.isActive) {
    throw new Error("Redeemable item not found or inactive");
  }

  // Check user balance
  const balance = await walletService.getBalance(userId);
  if (balance < redeemableItem.requiredCredits) {
    throw new Error("Insufficient credits");
  }

  // Deduct coins from wallet
  const deductResult = await walletService.deductCoins(
    userId,
    redeemableItem.requiredCredits,
    "REDEMPTION",
    `Redeemed: ${redeemableItem.name}`,
    { redeemableItemId: redeemableItem.id }
  );

  if (!deductResult.success) {
    throw new Error(deductResult.error || "Failed to deduct credits");
  }

  // Create redemption record
  const redemption = await prisma.redemption.create({
    data: {
      userId,
      redeemableItemId,
      creditsDeducted: redeemableItem.requiredCredits,
      balanceAfter: deductResult.newBalance,
      status: "PENDING",
      selectedVariant: selectedVariant || {},
    },
  });

  // Link wallet transaction to redemption
  if (deductResult.transactionId) {
    await prisma.walletTransaction.update({
      where: { id: deductResult.transactionId },
      data: { redemptionId: redemption.id },
    });
  }

  // Send webhook to fulfillment system (non-blocking)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      subscription: {
        include: {
          subscriptionPlan: true,
        },
      },
    },
  });

  if (user) {
    webhookService
      .sendRedemptionWebhook(redemption, user)
      .catch((error) => {
        console.error("Failed to send redemption webhook:", error);
      });
  }

  return redemption;
}
```

#### 2. Get Redemptions

```typescript
async getUserRedemptions(
  userId: number,
  options?: {
    status?: RedemptionStatus;
    limit?: number;
    offset?: number;
  }
): Promise<{
  redemptions: Redemption[];
  total: number;
}> {
  const where: any = { userId };
  if (options?.status) {
    where.status = options.status;
  }

  const [redemptions, total] = await Promise.all([
    prisma.redemption.findMany({
      where,
      include: {
        redeemableItem: true,
      },
      orderBy: { createdAt: "desc" },
      take: options?.limit || 50,
      skip: options?.offset || 0,
    }),
    prisma.redemption.count({ where }),
  ]);

  return { redemptions, total };
}
```

#### 3. Update Redemption Status

```typescript
async updateRedemptionStatus(
  redemptionId: number,
  userId: number,
  status: RedemptionStatus,
  fulfillmentNotes?: string
): Promise<Redemption> {
  // Verify ownership
  const redemption = await prisma.redemption.findFirst({
    where: { id: redemptionId, userId },
  });

  if (!redemption) {
    throw new Error("Redemption not found");
  }

  // Update status
  return await prisma.redemption.update({
    where: { id: redemptionId },
    data: {
      status,
      fulfillmentNotes,
    },
  });
}
```

#### 4. Get Redeemable Items

```typescript
async getRedeemableItems(): Promise<RedeemableItem[]> {
  return await prisma.redeemableItem.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });
}
```

### Webhook Integration

Redemptions trigger webhooks to fulfillment systems (CLIQSA):

```typescript
// In redemption creation
webhookService.sendRedemptionWebhook(redemption, user).catch((error) => {
  console.error("Failed to send redemption webhook:", error);
  // Increment retry count
  await prisma.redemption.update({
    where: { id: redemption.id },
    data: { webhookRetryCount: { increment: 1 } },
  });
});
```

**Webhook Payload:**
```typescript
{
  event: "credits.redemption.created",
  timestamp: "2024-01-01T00:00:00Z",
  data: {
    user: {
      id: 1,
      name: "John Doe",
      email: "john@example.com",
      tier: "ORIGIN_1000" | "VANGUARD_300" | null,
    },
    redemption: {
      id: 1,
      itemName: "IQniti T-shirt",
      creditsDeducted: 200,
      balanceAfter: 300,
      selectedVariant: { size: "M", color: "Black" },
      createdAt: "2024-01-01T00:00:00Z",
    },
  },
}
```

### API Endpoints

- `GET /api/redemption/items` - Get all redeemable items
- `GET /api/redemption/items/:id` - Get redeemable item by ID
- `POST /api/redemption` - Create redemption
- `GET /api/redemption` - Get user redemptions
- `GET /api/redemption/:id` - Get redemption by ID
- `PUT /api/redemption/:id/status` - Update redemption status
- `POST /api/redemption/:id/cancel` - Cancel redemption

### Important Code Snippets

**Redemption with Variant Selection:**
```typescript
const redemption = await redemptionService.createRedemption(
  userId,
  redeemableItemId,
  { size: "M", color: "Black" } // selectedVariant
);
```

**Balance Check Before Redemption:**
```typescript
const balance = await walletService.getBalance(userId);
if (balance < redeemableItem.requiredCredits) {
  throw new Error("Insufficient credits");
}
```

**Webhook Retry:**
```typescript
if (!webhookSent && webhookRetryCount < 3) {
  // Retry webhook
  await webhookService.sendRedemptionWebhook(redemption, user);
}
```

### Error Handling

- **400 Bad Request**: Invalid item, insufficient credits, inactive item
- **403 Forbidden**: User doesn't own the redemption
- **404 Not Found**: Redemption or item not found
- **500 Internal Server Error**: Database errors, webhook failures

### Testing Considerations

1. Test redemption creation with sufficient balance
2. Test redemption with insufficient balance
3. Test variant selection
4. Test webhook sending
5. Test redemption status updates
6. Test redemption cancellation
7. Test inactive item handling

