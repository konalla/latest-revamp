# Admin Panel

## Overview

The Admin Panel provides administrative functionality for managing users, subscriptions, redemptions, and system-wide operations. Admin users have separate authentication and access controls.

## Technical Architecture

### Admin Authentication

```typescript
// Separate admin login endpoint
POST /api/admin/auth/login

// Admin users cannot login through customer app
if (user.role === "ADMIN") {
  throw new Error("Admin users must login through the admin panel");
}
```

### Key Features

#### 1. User Management

- View all users
- Update user details
- Manage user subscriptions
- View user activity

#### 2. Subscription Management

- View all subscriptions
- Update subscription status
- Manage subscription plans
- Handle payment issues

#### 3. Redemption Management

- View all redemptions
- Update redemption status
- Add fulfillment notes
- Track webhook status

#### 4. System Administration

- View system statistics
- Manage redeemable items
- Configure system settings
- View referral program status

### API Endpoints

- `POST /api/admin/auth/login` - Admin login
- `GET /api/admin/users` - Get all users
- `GET /api/admin/users/:id` - Get user details
- `PUT /api/admin/users/:id` - Update user
- `GET /api/admin/subscriptions` - Get all subscriptions
- `GET /api/admin/redemptions` - Get all redemptions
- `PUT /api/admin/redemptions/:id/status` - Update redemption status
- `GET /api/admin/stats` - Get system statistics

### Important Code Snippets

**Admin Authentication:**
```typescript
// Admin middleware
export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};
```

**Admin Login:**
```typescript
const login = async (data: LoginRequest): Promise<AuthResponse> => {
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: data.identifier },
        { username: data.identifier }
      ],
      role: "ADMIN", // Only admin users
    }
  });

  if (!user) {
    throw new Error("Invalid credentials");
  }

  // Verify password
  const isPasswordValid = await bcrypt.compare(data.password, user.password);
  if (!isPasswordValid) {
    throw new Error("Invalid credentials");
  }

  // Generate admin token
  const token = generateToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  return { user, token };
};
```

