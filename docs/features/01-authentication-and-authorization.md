# Authentication & Authorization

## Overview

The authentication and authorization system provides secure user authentication using JWT tokens, password hashing with bcrypt, and role-based access control (USER and ADMIN roles).

## Technical Architecture

### Authentication Flow

1. **Registration**: Users register with email, username, name, and password
2. **Login**: Users authenticate with email/username and password
3. **Token Generation**: JWT tokens are generated upon successful authentication
4. **Token Verification**: Middleware verifies tokens on protected routes
5. **Password Reset**: Secure password reset flow with time-limited tokens

### Key Components

#### 1. JWT Token Management (`src/utils/jwt.utils.ts`)

```typescript
// Token generation
export const generateToken = (payload: UserJWTPayload): string => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN // Default: 3 days
  });
};

// Token verification
export const verifyToken = (token: string): UserJWTPayload => {
  return jwt.verify(token, JWT_SECRET) as UserJWTPayload;
};
```

**Important Details:**
- Uses `JWT_SECRET` from environment variables
- Token expiration: `JWT_EXPIRES_IN` (default: 3 days)
- Payload includes: `userId`, `email`, `role`

#### 2. Authentication Middleware (`src/middleware/auth.middleware.ts`)

```typescript
export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  try {
    const user = verifyToken(token) as any;
    const normalized = { ...user, id: user?.id ?? user?.userId };
    req.user = normalized; // Attach user to request object
    next();
  } catch (error) {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};
```

**Key Features:**
- Extracts token from `Authorization: Bearer <token>` header
- Normalizes user ID (handles both `id` and `userId` in payload)
- Attaches user object to `req.user` for downstream use
- Returns 401 for missing token, 403 for invalid/expired token

#### 3. Authentication Service (`src/services/auth.service.ts`)

**Registration Process:**

```typescript
const register = async (data: RegisterRequest): Promise<AuthResponse> => {
  // 1. Check for duplicate email/username
  const existingUserByEmail = await prisma.user.findUnique({
    where: { email: data.email }
  });
  
  // 2. Hash password with bcrypt (10 salt rounds)
  const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);
  
  // 3. Create user
  const user = await prisma.user.create({ ... });
  
  // 4. Ensure workspace and team exist
  await ensureWorkspaceAndTeamForUser(user.id, user.name, user.username);
  
  // 5. Register referral if referral code provided
  if (data.referralCode) {
    await referralService.registerReferral(user.id, data.referralCode);
  }
  
  // 6. Send signup webhook (non-blocking)
  webhookService.sendSignupWebhook(...).catch(...);
  
  // 7. Generate JWT token
  const token = generateToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });
  
  return { user, token, needsPaymentSetup: true };
};
```

**Login Process:**

```typescript
const login = async (data: LoginRequest): Promise<AuthResponse> => {
  // 1. Find user by email OR username
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: data.identifier },
        { username: data.identifier }
      ]
    }
  });
  
  // 2. Verify password with bcrypt
  const isPasswordValid = await bcrypt.compare(data.password, user.password);
  
  // 3. Prevent admin users from logging into customer app
  if (user.role === "ADMIN") {
    throw new Error("Admin users must login through the admin panel");
  }
  
  // 4. Ensure workspace/team backfill for existing users
  await ensureWorkspaceAndTeamForUser(user.id, user.name, user.username);
  
  // 5. Check if payment setup needed
  const needsPaymentSetup = !subscription || !subscription.stripeCustomerId;
  
  // 6. Generate JWT token
  const token = generateToken({ ... });
  
  return { user, token, needsPaymentSetup };
};
```

**Password Reset Flow:**

```typescript
// Step 1: Forgot Password
const forgotPassword = async (data: ForgotPasswordRequest) => {
  // Generate 64-character secure token
  const resetToken = crypto.randomBytes(32).toString("hex");
  
  // Set 1-hour expiry
  const resetTokenExpiry = new Date();
  resetTokenExpiry.setHours(resetTokenExpiry.getHours() + 1);
  
  // Store token in database
  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken, resetTokenExpiry }
  });
  
  // Send password reset email
  await sendPasswordResetEmail(user.email, user.name, resetToken);
};

// Step 2: Reset Password
const resetPassword = async (data: ResetPasswordRequest) => {
  // Validate token format (64 characters)
  if (!data.token || data.token.length !== 64) {
    throw new Error("Invalid or expired reset token");
  }
  
  // Find user by token
  const user = await prisma.user.findUnique({
    where: { resetToken: data.token }
  });
  
  // Check token expiry
  if (user.resetTokenExpiry < new Date()) {
    throw new Error("Invalid or expired reset token");
  }
  
  // Hash new password and clear token
  const hashedPassword = await bcrypt.hash(data.newPassword, SALT_ROUNDS);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      resetToken: null,
      resetTokenExpiry: null,
    }
  });
};
```

### Security Features

1. **Password Hashing**: Uses bcrypt with 10 salt rounds
2. **Token Security**: JWT tokens signed with secret key
3. **Token Expiration**: Configurable expiration (default: 3 days)
4. **Reset Token Security**: 64-character cryptographically secure tokens
5. **Email Enumeration Prevention**: Forgot password always returns success message
6. **Admin Separation**: Admin users cannot login through customer app

### Database Schema

```prisma
model User {
  id       Int      @id @default(autoincrement())
  username String   @unique
  email    String   @unique
  password String   // Hashed with bcrypt
  role     UserRole @default(USER)
  
  // Password Reset
  resetToken       String?   @unique
  resetTokenExpiry DateTime?
}

enum UserRole {
  USER
  ADMIN
}
```

### API Endpoints

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout (client-side token removal)
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password with token

### Environment Variables

```env
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=3d
```

### Integration Points

1. **Workspace Service**: Automatically creates workspace/team on registration/login
2. **Referral Service**: Registers referral if code provided during signup
3. **Webhook Service**: Sends signup webhook to external systems
4. **Subscription Service**: Checks if payment setup needed after login

### Important Code Snippets

**Token Extraction in Middleware:**
```typescript
const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN
```

**User ID Normalization:**
```typescript
const normalized = { ...user, id: user?.id ?? user?.userId };
req.user = normalized;
```

**Password Validation:**
```typescript
if (!data.newPassword || data.newPassword.length < 8) {
  throw new Error("Password must be at least 8 characters long");
}
```

### Error Handling

- **401 Unauthorized**: Missing or invalid token
- **403 Forbidden**: Expired token or admin trying to login to customer app
- **400 Bad Request**: Invalid input (duplicate email/username, weak password)
- **500 Internal Server Error**: Database or hashing errors

### Testing Considerations

1. Test token expiration
2. Test password reset token expiry
3. Test duplicate email/username registration
4. Test admin login restriction
5. Test referral code registration during signup
6. Test workspace/team auto-creation

