#!/bin/bash

# Production Deployment Script
# This script helps deploy the MANAGER → TEAM_MANAGER migration to production
#
# Usage:
#   chmod +x scripts/deploy-to-production.sh
#   ./scripts/deploy-to-production.sh
#
# IMPORTANT: Review and customize this script for your production environment!

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration (UPDATE THESE FOR YOUR ENVIRONMENT)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-iqniti}"
DB_USER="${DB_USER:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"

echo -e "${GREEN}🚀 Production Deployment Script${NC}"
echo "=================================="
echo ""

# Step 1: Backup Database
echo -e "${YELLOW}Step 1: Creating database backup...${NC}"
mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/backup_$(date +%Y%m%d_%H%M%S).sql"

if command -v pg_dump &> /dev/null; then
    echo "Creating backup: $BACKUP_FILE"
    pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" > "$BACKUP_FILE"
    
    if [ -f "$BACKUP_FILE" ] && [ -s "$BACKUP_FILE" ]; then
        echo -e "${GREEN}✅ Backup created successfully${NC}"
        echo "   Backup size: $(du -h "$BACKUP_FILE" | cut -f1)"
    else
        echo -e "${RED}❌ Backup failed!${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠️  pg_dump not found. Please create backup manually.${NC}"
    read -p "Press Enter to continue after creating backup manually..."
fi

echo ""

# Step 2: Check Current State
echo -e "${YELLOW}Step 2: Checking current database state...${NC}"
MANAGER_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM \"TeamMembership\" WHERE role = 'MANAGER'::\"TeamRole\";" | xargs)

echo "   Current MANAGER roles: $MANAGER_COUNT"

if [ "$MANAGER_COUNT" -gt 0 ]; then
    echo -e "${YELLOW}   Found $MANAGER_COUNT MANAGER role(s) to migrate${NC}"
else
    echo -e "${GREEN}   No MANAGER roles found (already migrated or none exist)${NC}"
fi

echo ""

# Step 3: Confirm Deployment
echo -e "${YELLOW}Step 3: Confirmation${NC}"
echo "This will:"
echo "  1. Run Prisma migration (add TEAM_MANAGER, update MANAGER → TEAM_MANAGER)"
echo "  2. Create WorkspaceRole enum and WorkspaceMembership table"
echo "  3. Run data migration script"
echo ""
read -p "Continue with deployment? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo -e "${YELLOW}Deployment cancelled${NC}"
    exit 0
fi

echo ""

# Step 4: Run Prisma Migration
echo -e "${YELLOW}Step 4: Running Prisma migration...${NC}"
if npx prisma migrate deploy; then
    echo -e "${GREEN}✅ Prisma migration completed${NC}"
else
    echo -e "${RED}❌ Prisma migration failed!${NC}"
    echo "   Check the error above and fix before continuing."
    exit 1
fi

echo ""

# Step 5: Run Data Migration Script
echo -e "${YELLOW}Step 5: Running data migration script...${NC}"
if npx tsx scripts/migrate-manager-to-team-manager.ts; then
    echo -e "${GREEN}✅ Data migration completed${NC}"
else
    echo -e "${RED}❌ Data migration failed!${NC}"
    echo "   You may need to run it manually or check the database state."
    exit 1
fi

echo ""

# Step 6: Verify Migration
echo -e "${YELLOW}Step 6: Verifying migration...${NC}"
REMAINING_MANAGERS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM \"TeamMembership\" WHERE role = 'MANAGER'::\"TeamRole\";" | xargs)
TEAM_MANAGERS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM \"TeamMembership\" WHERE role = 'TEAM_MANAGER'::\"TeamRole\";" | xargs)

echo "   Remaining MANAGER roles: $REMAINING_MANAGERS"
echo "   TEAM_MANAGER roles: $TEAM_MANAGERS"

if [ "$REMAINING_MANAGERS" -eq 0 ]; then
    echo -e "${GREEN}✅ Migration verification passed${NC}"
else
    echo -e "${RED}❌ Warning: $REMAINING_MANAGERS MANAGER roles still exist${NC}"
    echo "   You may need to run the migration script again."
fi

echo ""

# Step 7: Generate Prisma Client
echo -e "${YELLOW}Step 7: Generating Prisma client...${NC}"
if npx prisma generate; then
    echo -e "${GREEN}✅ Prisma client generated${NC}"
else
    echo -e "${RED}❌ Failed to generate Prisma client${NC}"
    exit 1
fi

echo ""

# Step 8: Final Instructions
echo -e "${GREEN}✅ Deployment steps completed!${NC}"
echo ""
echo "Next steps:"
echo "  1. Restart your application:"
echo "     pm2 restart all"
echo "     # or"
echo "     systemctl restart your-app"
echo "     # or"
echo "     docker-compose restart"
echo ""
echo "  2. Verify application is working:"
echo "     - Check application logs"
echo "     - Test API endpoints"
echo "     - Login and verify roles display correctly"
echo ""
echo "  3. Monitor for 24-48 hours for any issues"
echo ""
echo -e "${YELLOW}Backup location: $BACKUP_FILE${NC}"
echo "   Keep this backup until you're confident everything is working."

