import prisma from "../config/prisma.js";
import { subscriptionService } from "./subscription.service.js";

// Check if user is workspace owner (checks if user owns at least one workspace)
const isWorkspaceOwner = async (userId: number): Promise<boolean> => {
  const workspace = await prisma.workspace.findFirst({ where: { ownerId: userId } });
  return !!workspace;
};

// Get workspace for user (must be owner or workspace manager) - gets first workspace for backward compatibility
const getWorkspaceForOwner = async (userId: number) => {
  // First try to find owned workspace
  let workspace = await prisma.workspace.findFirst({ 
    where: { ownerId: userId },
    orderBy: { createdAt: "asc" }
  });
  
  // If not owner, check if workspace manager
  if (!workspace) {
    const workspaceMembership = await prisma.workspaceMembership.findFirst({
      where: { userId },
      include: { workspace: true },
      orderBy: { createdAt: "asc" }
    });
    
    if (workspaceMembership) {
      workspace = workspaceMembership.workspace;
    }
  }
  
  if (!workspace) {
    throw new Error("Workspace not found. Only workspace owners or workspace managers can manage teams.");
  }
  return workspace;
};

// Get workspace by ID and verify ownership or workspace manager role
const getWorkspaceByIdForOwner = async (userId: number, workspaceId: number) => {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) {
    throw new Error("Workspace not found");
  }
  
  // Check if user is workspace owner
  if (workspace.ownerId === userId) {
    return workspace;
  }
  
  // Check if user is workspace manager
  const isWorkspaceManager = await prisma.workspaceMembership.findUnique({
    where: {
      userId_workspaceId: { userId, workspaceId }
    }
  });
  
  if (!isWorkspaceManager) {
    throw new Error("You don't have permission to manage teams in this workspace");
  }
  
  return workspace;
};

// Check if user can manage a team (workspace owner, workspace manager, team ADMIN, or team TEAM_MANAGER)
const canManageTeam = async (userId: number, teamId: number): Promise<boolean> => {
  // First check if user is workspace owner by checking if the team belongs to their workspace
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { workspace: true }
  });
  
  if (!team) {
    return false;
  }
  
  if (team.workspace.ownerId === userId) {
    return true; // Workspace owner can manage any team in their workspace
  }
  
  // Check if user is workspace manager
  const isWorkspaceManager = await prisma.workspaceMembership.findUnique({
    where: {
      userId_workspaceId: { userId, workspaceId: team.workspaceId }
    }
  });
  
  if (isWorkspaceManager) {
    return true; // Workspace manager can manage any team in the workspace
  }
  
  // Check if user is ADMIN or TEAM_MANAGER of the team
  const membership = await prisma.teamMembership.findUnique({
    where: {
      userId_teamId: { userId, teamId }
    }
  });
  
  return membership?.role === "ADMIN" || membership?.role === "TEAM_MANAGER";
};

// Verify team exists and user has permission to manage it
const verifyTeamAccess = async (userId: number, teamId: number) => {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { workspace: true }
  });
  
  if (!team) {
    throw new Error("Team not found");
  }
  
  const hasAccess = await canManageTeam(userId, teamId);
  if (!hasAccess) {
    throw new Error("You don't have permission to manage this team");
  }
  
  return team;
};

export const listMembers = async (userId: number, teamId: number) => {
  await verifyTeamAccess(userId, teamId);
  
  const members = await prisma.teamMembership.findMany({
    where: { teamId },
    include: { user: { select: { id: true, username: true, name: true, email: true } } },
    orderBy: { createdAt: "asc" }
  });
  return members.map((m: any) => ({ 
    id: m.user.id, 
    username: m.user.username, 
    name: m.user.name, 
    email: m.user.email, 
    role: m.role,
    status: m.status
  }));
};

export const searchUsers = async (userId: number, teamId: number, query: string, limit = 20) => {
  await verifyTeamAccess(userId, teamId);
  
  const existing = await prisma.teamMembership.findMany({ where: { teamId }, select: { userId: true } });
  const existingIds = new Set(existing.map((e: any) => e.userId));

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

  // Filter out users who don't have active subscriptions
  // COMMENTED OUT: Temporarily disabled subscription filtering
  // const usersWithActiveSubscriptions = await Promise.all(
  //   users.map(async (user: any) => {
  //     const hasActive = await subscriptionService.hasActiveSubscription(user.id);
  //     return hasActive.hasActive ? user : null;
  //   })
  // );

  // return usersWithActiveSubscriptions
  //   .filter(u => u !== null && !existingIds.has(u!.id))
  //   .map(u => u!);

  // Return all users (excluding existing team members) without subscription check
  return users
    .filter(u => !existingIds.has(u.id));
};

export const addMember = async (
  userId: number, 
  teamId: number, 
  userIdToAdd: number, 
  role: "MEMBER" | "TEAM_MANAGER" | "ADMIN" = "MEMBER"
) => {
  await verifyTeamAccess(userId, teamId);
  
  // Check if user is already a member
  const existing = await prisma.teamMembership.findUnique({
    where: { userId_teamId: { userId: userIdToAdd, teamId } }
  });
  
  if (existing) {
    return { message: "User already in team" };
  }

  // Only workspace owner/admin can assign ADMIN role
  if (role === "ADMIN") {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { workspace: true }
    });

    if (!team || team.workspace.ownerId !== userId) {
      throw new Error("Only workspace owner/admin can assign ADMIN role");
    }
  }
  
  await prisma.teamMembership.create({
    data: { userId: userIdToAdd, teamId, role, status: "ACTIVE" }
  });
  return { message: "User added to team", role };
};

export const removeMember = async (userId: number, teamId: number, userIdToRemove: number) => {
  await verifyTeamAccess(userId, teamId);
  
  // Prevent user from removing themselves
  if (userId === userIdToRemove) {
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
  userId: number,
  teamId: number,
  userIdToUpdate: number, 
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "UNDER_REVIEW"
) => {
  await verifyTeamAccess(userId, teamId);

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

export const createTeam = async (userId: number, name: string, workspaceId?: number) => {
  // If workspaceId is provided, use it; otherwise use first workspace (backward compatibility)
  const workspace = workspaceId 
    ? await getWorkspaceByIdForOwner(userId, workspaceId)
    : await getWorkspaceForOwner(userId);

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
  // Verify user can manage the team (workspace owner, workspace manager, or team manager)
  await verifyTeamAccess(userId, teamId);

  // Delete team (cascade will handle memberships and related data)
  await prisma.team.delete({
    where: { id: teamId }
  });

  return { message: "Team deleted successfully" };
};

export const getTeamsInWorkspace = async (userId: number, workspaceId?: number) => {
  // If workspaceId is provided, use it; otherwise use first workspace (backward compatibility)
  const workspace = workspaceId 
    ? await getWorkspaceByIdForOwner(userId, workspaceId)
    : await getWorkspaceForOwner(userId);

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

// Get team details by ID (for team members/admins to view)
export const getTeamById = async (userId: number, teamId: number) => {
  // Check if user is a member of the team or workspace owner
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      workspace: true,
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
    }
  });

  if (!team) {
    throw new Error("Team not found");
  }

  // Check if user is workspace owner
  const isOwner = team.workspace.ownerId === userId;
  
  // Check if user is a member of the team
  const membership = await prisma.teamMembership.findUnique({
    where: {
      userId_teamId: { userId, teamId }
    }
  });

  if (!isOwner && !membership) {
    throw new Error("You don't have permission to view this team");
  }

  return {
    id: team.id,
    name: team.name,
    workspaceId: team.workspaceId,
    workspace: {
      id: team.workspace.id,
      name: team.workspace.name,
      ownerId: team.workspace.ownerId
    },
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
    })),
    userRole: membership?.role || null,
    userStatus: membership?.status || null
  };
};

// Update member role (promote/demote)
export const updateMemberRole = async (
  userId: number,
  teamId: number,
  userIdToUpdate: number,
  role: "ADMIN" | "MEMBER" | "TEAM_MANAGER"
) => {
  await verifyTeamAccess(userId, teamId);

  // Check if the member exists
  const membership = await prisma.teamMembership.findUnique({
    where: { userId_teamId: { userId: userIdToUpdate, teamId } },
    include: { user: { select: { id: true, username: true, name: true, email: true } } }
  });

  if (!membership) {
    throw new Error("Member not found in team");
  }

  // Only workspace owner/admin can assign ADMIN role
  if (role === "ADMIN") {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { workspace: true }
    });

    if (!team || team.workspace.ownerId !== userId) {
      throw new Error("Only workspace owner/admin can assign ADMIN role");
    }
  }

  // Prevent removing the last admin
  if (membership.role === "ADMIN" && role !== "ADMIN") {
    const adminCount = await prisma.teamMembership.count({
      where: {
        teamId,
        role: "ADMIN",
        status: "ACTIVE"
      }
    });

    if (adminCount <= 1) {
      throw new Error("Cannot remove the last admin from the team");
    }
  }

  // Update the role
  const updated = await prisma.teamMembership.update({
    where: { userId_teamId: { userId: userIdToUpdate, teamId } },
    data: { role },
    include: { user: { select: { id: true, username: true, name: true, email: true } } }
  });

  return {
    message: "Member role updated successfully",
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

// Get teams for a specific user (workspace owner only)
export const getUserTeams = async (workspaceOwnerId: number, targetUserId: number) => {
  // Verify requester is workspace owner
  const workspace = await getWorkspaceForOwner(workspaceOwnerId);

  // Get all teams in the workspace
  const workspaceTeams = await prisma.team.findMany({
    where: { workspaceId: workspace.id },
    select: { id: true }
  });

  const teamIds = workspaceTeams.map(t => t.id);

  // Get memberships for the target user in this workspace's teams
  const memberships = await prisma.teamMembership.findMany({
    where: {
      userId: targetUserId,
      teamId: { in: teamIds }
    },
    include: {
      team: {
        include: {
          workspace: true
        }
      }
    }
  });

  return memberships.map(m => ({
    id: m.team.id,
    name: m.team.name,
    workspaceId: m.team.workspaceId,
    createdAt: m.team.createdAt,
    updatedAt: m.team.updatedAt,
    role: m.role,
    status: m.status,
    membershipId: m.id,
    joinedAt: m.createdAt
  }));
};


