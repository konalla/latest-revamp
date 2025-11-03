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
  return members.map(m => ({ 
    id: m.user.id, 
    username: m.user.username, 
    name: m.user.name, 
    email: m.user.email, 
    role: m.role,
    status: m.status
  }));
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
    create: { userId: userIdToAdd, teamId, role: "MEMBER", status: "ACTIVE" },
    update: { role: "MEMBER", status: "ACTIVE" }
  });
  return { message: "User added to team" };
};

export const removeMember = async (adminUserId: number, userIdToRemove: number) => {
  const teamId = await getAdminTeamId(adminUserId);
  
  // Prevent admin from removing themselves
  if (adminUserId === userIdToRemove) {
    throw new Error("Cannot remove yourself from the team");
  }

  // Check if the member exists
  const membership = await prisma.teamMembership.findUnique({
    where: { userId_teamId: { userId: userIdToRemove, teamId } }
  });

  if (!membership) {
    throw new Error("Member not found in team");
  }

  // Remove the member
  await prisma.teamMembership.delete({
    where: { userId_teamId: { userId: userIdToRemove, teamId } }
  });

  return { message: "Member removed from team successfully" };
};

export const updateMemberStatus = async (
  adminUserId: number, 
  userIdToUpdate: number, 
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "UNDER_REVIEW"
) => {
  const teamId = await getAdminTeamId(adminUserId);

  // Check if the member exists
  const membership = await prisma.teamMembership.findUnique({
    where: { userId_teamId: { userId: userIdToUpdate, teamId } },
    include: { user: { select: { id: true, username: true, name: true, email: true } } }
  });

  if (!membership) {
    throw new Error("Member not found in team");
  }

  // Update the status
  const updated = await prisma.teamMembership.update({
    where: { userId_teamId: { userId: userIdToUpdate, teamId } },
    data: { status },
    include: { user: { select: { id: true, username: true, name: true, email: true } } }
  });

  return {
    message: "Member status updated successfully",
    member: {
      id: updated.user.id,
      username: updated.user.username,
      name: updated.user.name,
      email: updated.user.email,
      role: updated.role,
      status: updated.status
    }
  };
};


