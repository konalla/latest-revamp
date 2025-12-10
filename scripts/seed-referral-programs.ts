import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seedReferralPrograms() {
  console.log("Seeding referral programs...");

  // Seed Origin 1000 program
  const originProgram = await prisma.referralProgram.upsert({
    where: { name: "Origin 1000" },
    update: {},
    create: {
      name: "Origin 1000",
      description: "Founding members tier for the first 1000 users",
      totalSeats: 1000,
      requiredReferrals: 0,
      isActive: true,
    },
  });

  console.log("✓ Origin 1000 program seeded:", originProgram);

  // Seed Vanguard 300 program
  const vanguardProgram = await prisma.referralProgram.upsert({
    where: { name: "Vanguard 300" },
    update: {},
    create: {
      name: "Vanguard 300",
      description: "Elite tier of early access for the first 300 users who recruit 3+ others",
      totalSeats: 300,
      requiredReferrals: 3,
      isActive: true,
    },
  });

  console.log("✓ Vanguard 300 program seeded:", vanguardProgram);

  console.log("Referral programs seeding completed!");
}

seedReferralPrograms()
  .catch((error) => {
    console.error("Error seeding referral programs:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

