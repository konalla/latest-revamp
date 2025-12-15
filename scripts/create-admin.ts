/**
 * Script to create the first admin user
 * 
 * Usage:
 *   npx tsx scripts/create-admin.ts <email> <username> <name> <password>
 * 
 * Example:
 *   npx tsx scripts/create-admin.ts admin@example.com admin "Admin User" "SecurePassword123!"
 */

import bcrypt from "bcrypt";
import prisma from "../src/config/prisma.js";

const SALT_ROUNDS = 10;

async function createAdmin() {
  const args = process.argv.slice(2);

  if (args.length < 4) {
    console.error("Usage: npx tsx scripts/create-admin.ts <email> <username> <name> <password>");
    process.exit(1);
  }

  const [email, username, name, password] = args;

  try {
    // Check if admin already exists
    const existingAdmin = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { username },
          { role: "ADMIN" },
        ],
      },
    });

    if (existingAdmin) {
      if (existingAdmin.email === email) {
        console.error(`Error: User with email ${email} already exists`);
        process.exit(1);
      }
      if (existingAdmin.username === username) {
        console.error(`Error: User with username ${username} already exists`);
        process.exit(1);
      }
      if (existingAdmin.role === "ADMIN") {
        console.error("Error: An admin user already exists");
        process.exit(1);
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    // Create admin user
    const admin = await prisma.user.create({
      data: {
        email,
        username,
        name,
        password: hashedPassword,
        role: "ADMIN",
      },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        role: true,
        created_at: true,
      },
    });

    console.log("✅ Admin user created successfully!");
    console.log("\nAdmin Details:");
    console.log(`  ID: ${admin.id}`);
    console.log(`  Email: ${admin.email}`);
    console.log(`  Username: ${admin.username}`);
    console.log(`  Name: ${admin.name}`);
    console.log(`  Role: ${admin.role}`);
    console.log(`  Created: ${admin.created_at}`);
    console.log("\nYou can now login at: POST /api/admin/auth/login");
  } catch (error: any) {
    console.error("Error creating admin user:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();

