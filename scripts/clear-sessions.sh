#!/bin/bash

# Focus Session Cleanup Scripts
# This script provides easy access to focus session cleanup utilities

echo "🗑️  Focus Session Cleanup Tools"
echo "================================"
echo ""
echo "Available commands:"
echo "1. Clear all sessions (simple)"
echo "2. Clear all sessions (advanced with options)"
echo "3. Clear sessions for specific user"
echo "4. Dry run (show what would be deleted)"
echo "5. Exit"
echo ""

read -p "Choose an option (1-5): " choice

case $choice in
    1)
        echo "🗑️  Clearing all focus sessions..."
        npx tsx scripts/clear-focus-sessions.ts
        ;;
    2)
        echo "🔧 Advanced cleanup options:"
        echo "Available flags:"
        echo "  --dry-run     Show what would be deleted"
        echo "  --confirm     Actually delete sessions"
        echo "  --userId <id> Delete sessions for specific user"
        echo ""
        echo "Examples:"
        echo "  npx tsx scripts/clear-focus-sessions-advanced.ts --dry-run"
        echo "  npx tsx scripts/clear-focus-sessions-advanced.ts --confirm"
        echo "  npx tsx scripts/clear-focus-sessions-advanced.ts --userId 1 --confirm"
        echo ""
        read -p "Enter command (or press Enter to skip): " cmd
        if [ ! -z "$cmd" ]; then
            eval $cmd
        fi
        ;;
    3)
        read -p "Enter user ID: " userId
        echo "🗑️  Clearing sessions for user $userId..."
        npx tsx scripts/clear-focus-sessions-advanced.ts --userId $userId --confirm
        ;;
    4)
        echo "🔍 Running dry run to show what would be deleted..."
        npx tsx scripts/clear-focus-sessions-advanced.ts --dry-run
        ;;
    5)
        echo "👋 Goodbye!"
        exit 0
        ;;
    *)
        echo "❌ Invalid option. Please choose 1-5."
        exit 1
        ;;
esac

