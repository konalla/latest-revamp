import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seedFocusRoomTemplates() {
  console.log("🌱 Seeding Focus Room Templates...");

  // Get or create a system user (admin user with ID 1, or create one)
  let systemUserId = 1;
  const systemUser = await prisma.user.findUnique({
    where: { id: systemUserId },
  });

  if (!systemUser) {
    console.log("⚠️  System user not found. Please create an admin user first.");
    console.log("   Templates will be created with creatorId = 1");
  }

  const templates = [
    {
      name: "Pomodoro Deep Work",
      description: "Classic Pomodoro technique for deep, focused work sessions",
      category: "DEEP_WORK" as const,
      focusDuration: 25,
      breakDuration: 5,
      allowObservers: true,
      visibility: "PUBLIC" as const,
      isSystem: true,
    },
    {
      name: "Creative Flow",
      description: "Extended sessions for creative work and ideation",
      category: "CREATIVE" as const,
      focusDuration: 50,
      breakDuration: 10,
      allowObservers: true,
      visibility: "PUBLIC" as const,
      isSystem: true,
    },
    {
      name: "Study Session",
      description: "Optimized for learning and studying",
      category: "LEARNING" as const,
      focusDuration: 30,
      breakDuration: 8,
      allowObservers: true,
      visibility: "PUBLIC" as const,
      isSystem: true,
    },
    {
      name: "Strategic Planning",
      description: "Short focused sessions for planning and strategy",
      category: "PLANNING" as const,
      focusDuration: 20,
      breakDuration: 5,
      allowObservers: true,
      visibility: "PUBLIC" as const,
      isSystem: true,
    },
  ];

  for (const template of templates) {
    // Check if template already exists
    const existing = await prisma.focusRoomTemplate.findFirst({
      where: {
        name: template.name,
        isSystem: true,
      },
    });

    if (existing) {
      console.log(`⏭️  Template "${template.name}" already exists, skipping...`);
      continue;
    }

    try {
      await prisma.focusRoomTemplate.create({
        data: {
          ...template,
          creatorId: systemUserId,
          settings: {},
        },
      });
      console.log(`✅ Created template: ${template.name}`);
    } catch (error: any) {
      console.error(`❌ Error creating template "${template.name}":`, error.message);
    }
  }

  console.log("✨ Focus Room Templates seeding completed!");
}

seedFocusRoomTemplates()
  .catch((error) => {
    console.error("Error seeding templates:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
