# Wallet & Credits

## Overview

The Wallet & Credits system manages a virtual currency (coins) that users earn through referrals and can redeem for physical items. The system tracks transactions, balances, and lifetime earnings.

## Technical Architecture

### Wallet Models

```prisma
model Wallet {
  id          Int      @id @default(autoincrement())
  userId      Int      @unique
  balance     Int      @default(0) // Current coin balance
  totalEarned Int      @default(0) // Lifetime coins earned
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user         User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  transactions WalletTransaction[]
}

model WalletTransaction {
  id           Int                       @id @default(autoincrement())
  walletId     Int
  type         WalletTransactionType     // EARNED or REDEEMED
  amount       Int                       // Positive amount
  balanceAfter Int                       // Wallet balance after this transaction
  category     WalletTransactionCategory // REFERRAL or REDEMPTION
  description  String
  metadata     Json                      @default("{}") // Referral ID, redemption ID, etc.
  redemptionId Int?                      @unique // Link to redemption if applicable
  createdAt    DateTime                  @default(now())

  wallet     Wallet      @relation(fields: [walletId], references: [id], onDelete: Cascade)
  redemption Redemption? @relation(fields: [redemptionId], references: [id], onDelete: SetNull)
}

enum WalletTransactionType {
  EARNED
  REDEEMED
}

enum WalletTransactionCategory {
  REFERRAL
  REDEMPTION
}
```

### Key Features

#### 1. Wallet Creation

Wallets are created automatically when needed:

```typescript
async getOrCreateWallet(userId: number): Promise<Wallet> {
  let wallet = await prisma.wallet.findUnique({
    where: { userId },
  });

  if (!wallet) {
    wallet = await prisma.wallet.create({
      data: {
        userId,
        balance: 0,
        totalEarned: 0,
      },
    });
  }

  return wallet;
}
```

#### 2. Awarding Coins

Users earn coins through referrals:

```typescript
async awardCoins(
  userId: number,
  amount: number,
  category: "REFERRAL",
  description: string,
  metadata?: AwardCoinsMetadata
): Promise<{
  success: boolean;
  newBalance: number;
  transactionId?: number;
  error?: string;
}> {
  try {
    if (amount <= 0) {
      return {
        success: false,
        newBalance: 0,
        error: "Coin amount must be positive",
      };
    }

    // Get or create wallet
    const wallet = await this.getOrCreateWallet(userId);

    // Calculate new balance
    const newBalance = wallet.balance + amount;
    const newTotalEarned = wallet.totalEarned + amount;

    // Update wallet balance
    const updatedWallet = await prisma.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: newBalance,
        totalEarned: newTotalEarned,
      },
    });

    // Create transaction record
    const transaction = await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "EARNED",
        amount: amount,
        balanceAfter: newBalance,
        category: category,
        description: description,
        metadata: metadata || {},
      },
    });

    return {
      success: true,
      newBalance: updatedWallet.balance,
      transactionId: transaction.id,
    };
  } catch (error: any) {
    console.error("Error awarding coins:", error);
    return {
      success: false,
      newBalance: 0,
      error: error.message || "Failed to award coins",
    };
  }
}
```

**Coin Earning Sources:**
- **100 coins** per completed referral
- **500 coins** bonus for Vanguard 300 qualification

#### 3. Deducting Coins (Redemptions)

Coins are deducted when users redeem items:

```typescript
async deductCoins(
  userId: number,
  amount: number,
  category: "REDEMPTION",
  description: string,
  metadata?: DeductCoinsMetadata
): Promise<{
  success: boolean;
  newBalance: number;
  transactionId?: number;
  error?: string;
}> {
  try {
    if (amount <= 0) {
      return {
        success: false,
        newBalance: 0,
        error: "Coin amount must be positive",
      };
    }

    // Get wallet
    const wallet = await this.getOrCreateWallet(userId);

    // Check sufficient balance
    if (wallet.balance < amount) {
      return {
        success: false,
        newBalance: wallet.balance,
        error: "Insufficient balance",
      };
    }

    // Calculate new balance
    const newBalance = wallet.balance - amount;

    // Update wallet balance
    const updatedWallet = await prisma.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: newBalance,
      },
    });

    // Create transaction record
    const transaction = await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "REDEEMED",
        amount: amount,
        balanceAfter: newBalance,
        category: category,
        description: description,
        metadata: metadata || {},
        redemptionId: metadata?.redemptionId,
      },
    });

    return {
      success: true,
      newBalance: updatedWallet.balance,
      transactionId: transaction.id,
    };
  } catch (error: any) {
    console.error("Error deducting coins:", error);
    return {
      success: false,
      newBalance: 0,
      error: error.message || "Failed to deduct coins",
    };
  }
}
```

#### 4. Transaction History

```typescript
async getTransactionHistory(
  userId: number,
  options?: {
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
  }
): Promise<{
  transactions: WalletTransaction[];
  total: number;
  balance: number;
}> {
  const wallet = await this.getOrCreateWallet(userId);

  const where: any = {
    walletId: wallet.id,
  };

  if (options?.startDate || options?.endDate) {
    where.createdAt = {};
    if (options.startDate) {
      where.createdAt.gte = options.startDate;
    }
    if (options.endDate) {
      where.createdAt.lte = options.endDate;
    }
  }

  const [transactions, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: options?.limit || 50,
      skip: options?.offset || 0,
    }),
    prisma.walletTransaction.count({ where }),
  ]);

  return {
    transactions,
    total,
    balance: wallet.balance,
  };
}
```

#### 5. Get Wallet Balance

```typescript
async getBalance(userId: number): Promise<number> {
  const wallet = await this.getOrCreateWallet(userId);
  return wallet.balance;
}

async getTotalEarned(userId: number): Promise<number> {
  const wallet = await this.getOrCreateWallet(userId);
  return wallet.totalEarned;
}
```

### Integration Points

1. **Referral Service**: Awards coins when referrals are completed
2. **Redemption Service**: Deducts coins when items are redeemed
3. **Status Assignment Service**: Awards bonus coins for Vanguard qualification

### API Endpoints

- `GET /api/wallet` - Get wallet balance and info
- `GET /api/wallet/transactions` - Get transaction history
- `GET /api/wallet/balance` - Get current balance
- `GET /api/wallet/total-earned` - Get lifetime coins earned

### Important Code Snippets

**Coin Awarding on Referral Completion:**
```typescript
// In referral service
await walletService.awardCoins(
  referrerId,
  100,
  "REFERRAL",
  `Referral completed: ${referredUser.email}`,
  { referralId: referral.id, referredUserId: referredUser.id }
);
```

**Coin Deduction on Redemption:**
```typescript
// In redemption service
const result = await walletService.deductCoins(
  userId,
  redeemableItem.requiredCredits,
  "REDEMPTION",
  `Redeemed: ${redeemableItem.name}`,
  { redemptionId: redemption.id, redeemableItemId: redeemableItem.id }
);
```

**Balance Check:**
```typescript
const balance = await walletService.getBalance(userId);
if (balance < requiredCredits) {
  throw new Error("Insufficient credits");
}
```

### Error Handling

- **400 Bad Request**: Invalid amount, insufficient balance
- **404 Not Found**: Wallet not found (should auto-create)
- **500 Internal Server Error**: Database errors

### Testing Considerations

1. Test wallet auto-creation
2. Test coin awarding logic
3. Test coin deduction with insufficient balance
4. Test transaction history filtering
5. Test balance calculations
6. Test lifetime earnings tracking

