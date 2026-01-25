# IQniti Backend

A TypeScript backend application for managing projects, objectives, OKRs (Objectives and Key Results), and tasks with user authentication.

## 🚀 Features

- User authentication with JWT
- Project management
- Objectives and OKRs tracking
- Task management with Eisenhower Matrix support
- RESTful API with Express.js
- PostgreSQL database with Prisma ORM
- TypeScript for type safety

## 📋 Prerequisites

Before setting up the application, make sure you have the following installed:

- **Node.js** (version 18 or higher)
- **npm** or **yarn**
- **PostgreSQL** (version 12 or higher)

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd iqniti-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env` file in the root directory:
   ```bash
   cp .env.example .env  # if you have an example file
   # OR create a new .env file
   touch .env
   ```

   Add the following environment variables to your `.env` file:
   ```env
   # Database
   DATABASE_URL="postgresql://username:password@localhost:5432/iqniti_db"
   
   # JWT Configuration
   JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
   JWT_EXPIRES_IN="7d"
   
   # Server Configuration
   PORT=3000
   NODE_ENV="development"
   
   # CORS Configuration
   CORS_ORIGINS="https://workspace.iqniti.com,https://dashboard.iqniti.com,http://localhost:5173"
   ```

## 🗄️ Database Setup

1. **Create a PostgreSQL database**
   ```sql
   createdb iqniti_db
   ```

2. **Generate Prisma client**
   ```bash
   npx prisma generate
   ```

3. **Run database migrations**
   ```bash
   npx prisma migrate dev
   ```

   This will apply all existing migrations:
   - Create users table
   - Create projects table
   - Create objectives table
   - Create OKRs table
   - Create tasks table

4. **Seed the database (optional)**
   ```bash
   npx prisma db seed  # if seed file exists
   ```

## 🏃‍♂️ Running the Application

### Development Mode
```bash
npm run dev
```
This starts the server with hot-reloading using `tsx`.

### Production Mode
```bash
# Build the application
npm run build

# Start the production server
npm start
```

The server will be available at `http://localhost:3000` (or your configured PORT).

## 📊 Database Management

### Prisma Studio (Database GUI)
```bash
npx prisma studio
```

### Reset Database
```bash
npx prisma migrate reset
```

### View Database Schema
```bash
npx prisma db pull
```

🗄️ Database Setup

### 1. Generate Prisma Client
```bash
npx prisma generate
```
Or it runs automatically after `npm install` via `postinstall` script.

### 2. Run Database Migrations

**For Development:**
```bash
npx prisma migrate dev
```

**For Production:**
```bash
npx prisma migrate deploy
```

### 3. Check Migration Status
```bash
npx prisma migrate status
```

### 4. Prisma Studio (Database GUI)
```bash
npx prisma studio
```

---

## 🌱 Seeding Scripts

### Individual Seeding Scripts

#### 1. Seed Subscription Plans
Creates all subscription plans (Trial, Free, Monthly, Yearly, Essential Twenty, Business Pro, Focus Master, Performance Founder) and Stripe payment provider.

```bash
# OR
npx tsx scripts/seed-subscriptions.ts
```

**What it seeds:**
- Stripe payment provider
- Clarity Plan (trial - 14 days, 50 tasks)
- Free Plan (1 project, 5 objectives, 10 key results, 50 tasks, 1 workspace, 5 teams)
- Pro Plan - Monthly ($18/month, 1000 tasks)
- Pro Plan - Yearly ($180/year, 10000 tasks)
- Essential Twenty ($24/month, 1500 tasks)
- Business Pro ($49/month, 2000 tasks)
- Focus Master ($20/month, unlimited tasks, 7 workspaces)
- Performance Founder ($200/year, unlimited tasks, 12 workspaces)

**Note:** After running this script, you need to manually update `stripePriceId` and `stripeProductId` fields in the database after creating products in Stripe Dashboard.

#### 2. Seed Referral Programs
Creates the Origin 1000 and Vanguard 300 referral programs.

```bash
# OR
npx tsx scripts/seed-referral-programs.ts
```

**What it seeds:**
- Origin 1000 program (first 1000 users, 0 referrals required)
- Vanguard 300 program (first 300 users with 3+ referrals)

#### 3. Seed Focus Room Templates
Creates default focus room templates for users.

```bash
# OR
npx tsx scripts/seed-focus-room-templates.ts
```

**What it seeds:**
- Pomodoro Deep Work (25 min focus, 5 min break)
- Creative Flow (50 min focus, 10 min break)
- Study Session (30 min focus, 8 min break)
- Strategic Planning (20 min focus, 5 min break)

**Note:** Requires an admin user with ID 1 to exist. If not, templates will be created with `creatorId = 1`.



## 👤 Admin User Creation

### Create First Admin User
Creates the first admin user for accessing the admin panel.

```bash
npx tsx scripts/create-admin.ts <email> <username> <name> <password>
```

**Example:**
```bash
npx tsx scripts/create-admin.ts admin@example.com admin "Admin User" "SecurePassword123!"
```

**Important:** 
- Run this **before** seeding focus room templates if you want them associated with the admin user
- The script checks if an admin already exists and prevents duplicate creation

---

## 🔧 Complete Setup Workflow

### For Fresh Installation (Development)

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
# Create .env file with required variables

# 3. Create database (if not exists)
createdb iqniti_db

# 4. Generate Prisma client
npx prisma generate

# 5. Run migrations
npx prisma migrate dev

# 6. Create admin user
npx tsx scripts/create-admin.ts admin@example.com admin "Admin User" "SecurePassword123!"

# 8. Start development server
npm run dev
```

### For Production

```bash
# 1. Install dependencies
npm install

# 2. Set up environment variables
# Create .env file with production values

# 3. Generate Prisma client
npx prisma generate

# 4. Run migrations (production)
npx prisma migrate deploy

# 5. Create admin user
npx tsx scripts/create-admin.ts admin@example.com admin "Admin User" "SecurePassword123!"

## 🔗 API Endpoints

The application provides the following API endpoints:

- **Authentication**: `/api/auth/*`
- **Users**: `/api/users/*`
- **Projects**: `/api/projects/*`
- **Objectives**: `/api/objectives/*`
- **OKRs**: `/api/okrs/*`
- **Tasks**: `/api/tasks/*`
- **Health Check**: `/api/health`

## 📁 Project Structure

```
iqniti-backend/
├── prisma/
│   ├── migrations/          # Database migrations
│   └── schema.prisma        # Database schema
├── src/
│   ├── config/              # Configuration files
│   ├── controllers/         # Route controllers
│   ├── middleware/          # Express middleware
│   ├── routes/              # API routes
│   ├── services/            # Business logic
│   ├── types/               # TypeScript type definitions
│   ├── utils/               # Utility functions
│   ├── app.ts               # Express app setup
│   └── server.ts            # Server entry point
├── package.json
├── tsconfig.json
└── README.md
```

## 🔧 Available Scripts

- `npm run dev` - Start development server with hot-reload
- `npm run build` - Build the TypeScript project
- `npm start` - Start production server
- `npm run prisma` - Run Prisma CLI commands

## 🌍 Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection string | - | ✅ |
| `JWT_SECRET` | Secret key for JWT tokens | Default provided | ⚠️ Recommended |
| `JWT_EXPIRES_IN` | JWT token expiration time | `7d` | ❌ |
| `PORT` | Server port | `3000` | ❌ |
| `NODE_ENV` | Environment mode | `development` | ❌ |
| `CORS_ORIGINS` | Comma-separated list of allowed CORS origins | `http://localhost:5173` | ❌ |

⚠️ **Security Note**: Always use a strong, unique `JWT_SECRET` in production environments.

## 🚨 Troubleshooting

### Common Issues

1. **Database connection fails**
   - Ensure PostgreSQL is running
   - Verify `DATABASE_URL` in `.env` file
   - Check database exists and credentials are correct

2. **Prisma client not generated**
   ```bash
   npx prisma generate
   ```

3. **Migration errors**
   ```bash
   npx prisma migrate reset
   npx prisma migrate dev
   ```

   npx prisma migrate deploy

4. **Port already in use**
   - Change the `PORT` in your `.env` file
   - Or kill the process using the port: `lsof -ti:3000 | xargs kill`

## 📝 Development

1. **Adding new models**: Update `prisma/schema.prisma` and run migrations
2. **API routes**: Add routes in `src/routes/`, controllers in `src/controllers/`, and services in `src/services/`
3. **TypeScript types**: Define types in `src/types/`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests (if available)
5. Submit a pull request

---

For more information about the specific APIs and their usage, refer to the individual controller files in the `src/controllers/` directory.
