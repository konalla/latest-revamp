import prisma from "../config/prisma.js";

const getAdminTeamId = async (userId: number): Promise<number> => {
  const ws = await prisma.workspace.findUnique({ where: { ownerId: userId }, include: { team: true } });
  if (!ws || !ws.team) throw new Error("Admin team not found");
  return ws.team.id;
};

export const listMembers = async (adminUserId: number) => {
  const teamId = await getAdminTeamId(adminUserId);
  const members = await prisma.teamMembership.findMany({
    where: { teamId },
    include: { user: { select: { id: true, username: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" }
  });
  return members.map(m => ({ id: m.user.id, username: m.user.username, name: m.user.name, email: m.user.email, role: m.role }));
};

export const searchUsers = async (adminUserId: number, query: string, limit = 20) => {
  const teamId = await getAdminTeamId(adminUserId);
  const existing = await prisma.teamMembership.findMany({ where: { teamId }, select: { userId: true } });
  const existingIds = new Set(existing.map(e => e.userId));

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { username: { contains: query, mode: "insensitive" } },
        { email: { contains: query, mode: "insensitive" } }
      ]
    },
    take: limit,
    select: { id: true, username: true, name: true, email: true }
  });

  return users.filter(u => !existingIds.has(u.id));
};

export const addMember = async (adminUserId: number, userIdToAdd: number) => {
  const teamId = await getAdminTeamId(adminUserId);
  if (adminUserId === userIdToAdd) {
    // Admin already a member
    return { message: "User already in team" };
  }
  await prisma.teamMembership.upsert({
    where: { userId_teamId: { userId: userIdToAdd, teamId } },
    create: { userId: userIdToAdd, teamId, role: "MEMBER" },
    update: { role: "MEMBER" }
  });
  return { message: "User added to team" };
};


