import prisma from "../config/prisma.js";

const getAdminTeamId = async (userId: number): Promise<number> => {
  const ws = await prisma.workspace.findUnique({ where: { ownerId: userId }, include: { teams: true } });
  if (!ws || !ws.teams || ws.teams.length === 0) throw new Error("Admin team not found");
  // Return the first team (the original one created at registration)
  return ws.teams[0].id;
};

// Check if user is workspace owner
const isWorkspaceOwner = async (userId: number): Promise<boolean> => {
  const workspace = await prisma.workspace.findUnique({ where: { ownerId: userId } });
  return !!workspace;
};

// Get workspace for user (must be owner)
const getWorkspaceForOwner = async (userId: number) => {
  const workspace = await prisma.workspace.findUnique({ where: { ownerId: userId } });
  if (!workspace) {
    throw new Error("Workspace not found. Only workspace owners can manage teams.");
  }
  return workspace;
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

// Team CRUD operations for workspace owners

export const createTeam = async (userId: number, name: string) => {
  // Verify user is workspace owner
  const workspace = await getWorkspaceForOwner(userId);

  // Check if team name already exists in this workspace
  const existingTeam = await prisma.team.findFirst({
    where: {
      workspaceId: workspace.id,
      name: name.trim()
    }
  });

  if (existingTeam) {
    throw new Error("A team with this name already exists in your workspace");
  }

  // Create team and add creator as ADMIN
  return await prisma.$transaction(async (tx) => {
    const team = await tx.team.create({
      data: {
        name: name.trim(),
        workspaceId: workspace.id
      }
    });

    // Creator becomes ADMIN of the new team
    await tx.teamMembership.create({
      data: {
        userId,
        teamId: team.id,
        role: "ADMIN",
        status: "ACTIVE"
      }
    });

    return team;
  });
};

export const updateTeam = async (userId: number, teamId: number, name: string) => {
  // Verify user is workspace owner
  const workspace = await getWorkspaceForOwner(userId);

  // Verify team belongs to this workspace
  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      workspaceId: workspace.id
    }
  });

  if (!team) {
    throw new Error("Team not found or you don't have permission to update it");
  }

  // Check if another team with this name exists in this workspace
  const existingTeam = await prisma.team.findFirst({
    where: {
      workspaceId: workspace.id,
      name: name.trim(),
      id: { not: teamId }
    }
  });

  if (existingTeam) {
    throw new Error("A team with this name already exists in your workspace");
  }

  return await prisma.team.update({
    where: { id: teamId },
    data: { name: name.trim() }
  });
};

export const deleteTeam = async (userId: number, teamId: number) => {
  // Verify user is workspace owner
  const workspace = await getWorkspaceForOwner(userId);

  // Verify team belongs to this workspace
  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      workspaceId: workspace.id
    }
  });

  if (!team) {
    throw new Error("Team not found or you don't have permission to delete it");
  }

  // Delete team (cascade will handle memberships and related data)
  await prisma.team.delete({
    where: { id: teamId }
  });

  return { message: "Team deleted successfully" };
};

export const getTeamsInWorkspace = async (userId: number) => {
  // Verify user is workspace owner
  const workspace = await getWorkspaceForOwner(userId);

  // Get all teams in the workspace with member counts
  const teams = await prisma.team.findMany({
    where: { workspaceId: workspace.id },
    include: {
      memberships: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              name: true,
              email: true
            }
          }
        }
      }
    },
    orderBy: { createdAt: "asc" }
  });

  return teams.map(team => ({
    id: team.id,
    name: team.name,
    workspaceId: team.workspaceId,
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
    memberCount: team.memberships.length,
    members: team.memberships.map(m => ({
      id: m.user.id,
      username: m.user.username,
      name: m.user.name,
      email: m.user.email,
      role: m.role,
      status: m.status
    }))
  }));
};


