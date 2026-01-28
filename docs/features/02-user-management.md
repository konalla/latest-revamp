# User Management

## Overview

The user management system handles user profiles, settings, status tracking, and user-related operations throughout the application.

## Technical Architecture

### User Model Structure

The User model contains comprehensive information about users:

```prisma
model User {
  // Basic Info
  id       Int      @id @default(autoincrement())
  username String   @unique
  name     String
  email    String   @unique
  password String
  role     UserRole @default(USER)
  
  // Profile Information
  phone_number        String?
  company_name        String?
  company_size        String?
  company_description String?
  founded_year        Int?
  website             String?
  profile_photo_url   String?
  job_title           String?
  industry            String?
  bio                 String?
  timezone            String?
  
  // Social Links
  linkedin_url          String?
  website_url           String?
  secondary_social_url  String?
  secondary_social_type String?
  
  // Preferences & Settings
  preferred_working_hours       Json     @default("{}")
  communication_preference      String?
  primary_work_focus            String?
  profile_completion_percentage Int      @default(20)
  last_profile_update           DateTime @default(now())
  
  // Work Duration Preferences (AI Recommendation System)
  deep_work_start_time       String @default("09:00")
  deep_work_end_time         String @default("12:00")
  creative_work_start_time   String @default("12:00")
  creative_work_end_time     String @default("15:00")
  reflective_work_start_time String @default("15:00")
  reflective_work_end_time   String @default("18:00")
  executive_work_start_time  String @default("18:00")
  executive_work_end_time    String @default("21:00")
  
  // Credits System
  credits               Int      @default(100)
  credit_refresh_period String   @default("monthly")
  credit_refresh_amount Int      @default(100)
  last_credit_refresh   DateTime @default(now())
  
  // Profile Visibility
  profileVisibility ProfileVisibility @default(PRIVATE)
  
  // Active Status Tracking
  isOnline        Boolean   @default(false)
  statusUpdatedAt DateTime?
}
```

### Key Features

#### 1. User Status Tracking

The system tracks user online/offline status based on focus sessions:

```typescript
// Status is updated when:
// - User starts a focus session → isOnline = true
// - User ends a focus session → isOnline = false (after timeout)
// - User is inactive for extended period → isOnline = false
```

**Status Update Logic:**
- `isOnline`: Boolean indicating if user is currently active
- `statusUpdatedAt`: Timestamp of last status update
- Indexed for efficient queries: `@@index([isOnline])`, `@@index([statusUpdatedAt])`

#### 2. Profile Completion

Profile completion percentage is calculated based on filled fields:

```typescript
// Default: 20% (basic info only)
// Increases as user fills:
// - Company information
// - Job title and industry
// - Bio and social links
// - Profile photo
// - Working hours preferences
```

#### 3. Work Duration Preferences

Users can set preferred working hours for different cognitive modes:

- **Deep Work**: Default 09:00 - 12:00
- **Creative Work**: Default 12:00 - 15:00
- **Reflective Work**: Default 15:00 - 18:00
- **Executive Work**: Default 18:00 - 21:00

These preferences are used by the AI Recommendation system to suggest optimal task scheduling.

#### 4. Credits System

Each user has a credits system:

```typescript
credits               Int      @default(100)
credit_refresh_period String   @default("monthly")
credit_refresh_amount Int      @default(100)
last_credit_refresh   DateTime @default(now())
```

**Credit Management:**
- Credits are used for various features (redemptions, etc.)
- Credits refresh monthly by default
- Refresh amount and period are configurable per user

### User Service Operations

#### Get User Profile

```typescript
async getUserProfile(userId: number) {
  return await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      // ... all profile fields
    }
  });
}
```

#### Update User Profile

```typescript
async updateUserProfile(userId: number, data: UpdateUserRequest) {
  // Calculate profile completion percentage
  const completionPercentage = calculateProfileCompletion(data);
  
  return await prisma.user.update({
    where: { id: userId },
    data: {
      ...data,
      profile_completion_percentage: completionPercentage,
      last_profile_update: new Date(),
    }
  });
}
```

#### Update User Status

```typescript
async updateUserStatus(userId: number, isOnline: boolean) {
  return await prisma.user.update({
    where: { id: userId },
    data: {
      isOnline,
      statusUpdatedAt: new Date(),
    }
  });
}
```

### User Settings

Separate model for user-specific settings:

```prisma
model UserSettings {
  id        Int      @id @default(autoincrement())
  userId    Int      @unique
  language  String   @default("english")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

### Profile Visibility

Users can control profile visibility:

```prisma
enum ProfileVisibility {
  PRIVATE      // Only visible to user
  PUBLIC       // Visible to everyone
  FRIENDS_ONLY // Visible to connections
}
```

### API Endpoints

- `GET /api/users/:id` - Get user profile
- `PUT /api/users/:id` - Update user profile
- `GET /api/users/:id/status` - Get user status
- `PUT /api/users/:id/status` - Update user status
- `GET /api/user-settings` - Get user settings
- `PUT /api/user-settings` - Update user settings

### Integration Points

1. **Focus Sessions**: Updates user status when sessions start/end
2. **AI Recommendations**: Uses work duration preferences
3. **Profile Service**: Handles profile photo uploads
4. **Subscription Service**: Checks user subscription status
5. **Referral Service**: Links to referral status

### Important Code Snippets

**Profile Completion Calculation:**
```typescript
function calculateProfileCompletion(userData: any): number {
  let filledFields = 0;
  const totalFields = 15; // Total profile fields
  
  if (userData.company_name) filledFields++;
  if (userData.job_title) filledFields++;
  if (userData.industry) filledFields++;
  // ... check all fields
  
  return Math.round((filledFields / totalFields) * 100);
}
```

**Status Update on Focus Session:**
```typescript
// When focus session starts
await userService.updateUserStatus(userId, true);

// When focus session ends (with timeout)
setTimeout(async () => {
  await userService.updateUserStatus(userId, false);
}, 5 * 60 * 1000); // 5 minutes after session ends
```

**Work Preferences Usage:**
```typescript
// In AI Recommendation Service
const userPreferences = await prisma.user.findUnique({
  where: { id: userId },
  select: {
    deep_work_start_time: true,
    deep_work_end_time: true,
    // ... other work time preferences
  }
});

// Use preferences to suggest optimal task scheduling
const recommendedTime = calculateOptimalTime(
  taskCategory,
  userPreferences
);
```

### Database Indexes

```prisma
@@index([isOnline])
@@index([statusUpdatedAt])
@@index([email])
@@index([username])
```

### Error Handling

- **404 Not Found**: User not found
- **400 Bad Request**: Invalid profile data
- **403 Forbidden**: Unauthorized profile update
- **500 Internal Server Error**: Database errors

### Testing Considerations

1. Test profile completion calculation
2. Test status updates on focus session events
3. Test work preferences impact on AI recommendations
4. Test profile visibility settings
5. Test credits refresh logic
6. Test profile photo upload

