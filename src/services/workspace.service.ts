import prisma from "../config/prisma.js";

const generateBaseNames = (name: string, username: string) => {
  const base = (name && name.trim().length > 0) ? name.trim() : username.trim();
  return {
    workspaceBase: `${base}'s Workspace`,
    teamBase: `${base}'s Team`
  };
};

const findAvailableName = async (table: "workspace" | "team", baseName: string): Promise<string> => {
  // No DB unique constraint on name, but disambiguate aesthetically
  let candidate = baseName;
  let suffix = 2;
  while (true) {
    if (table === "workspace") {
      const existing = await prisma.workspace.findFirst({ where: { name: candidate } });
      if (!existing) return candidate;
    } else {
      const existing = await prisma.team.findFirst({ where: { name: candidate } });
      if (!existing) return candidate;
    }
    candidate = `${baseName} (${suffix})`;
    suffix += 1;
  }
};

export const ensureWorkspaceAndTeamForUser = async (userId: number, name: string, username: string) => {
  return await prisma.$transaction(async (tx) => {
    // One workspace per owner enforced by unique(ownerId)
    let workspace = await tx.workspace.findUnique({ where: { ownerId: userId }, include: { team: true } });
    if (!workspace) {
      const { workspaceBase, teamBase } = generateBaseNames(name, username);
      const workspaceName = await findAvailableName("workspace", workspaceBase);
      workspace = await tx.workspace.create({ data: { name: workspaceName, ownerId: userId } });

      const teamName = await findAvailableName("team", teamBase);
      const team = await tx.team.create({ data: { name: teamName, workspaceId: workspace.id } });

      // Owner becomes ADMIN member of their team
      await tx.teamMembership.create({ data: { userId, teamId: team.id, role: "ADMIN" } });

      workspace = { ...workspace, team } as any;
    } else if (!workspace.team) {
      const { teamBase } = generateBaseNames(name, username);
      const teamName = await findAvailableName("team", teamBase);
      const team = await tx.team.create({ data: { name: teamName, workspaceId: workspace.id } });
      await tx.teamMembership.upsert({
        where: { userId_teamId: { userId, teamId: team.id } },
        create: { userId, teamId: team.id, role: "ADMIN" },
        update: { role: "ADMIN" }
      });
      workspace = { ...workspace, team } as any;
    } else {
      // Ensure admin membership exists
      await tx.teamMembership.upsert({
        where: { userId_teamId: { userId, teamId: workspace.team.id } },
        create: { userId, teamId: workspace.team.id, role: "ADMIN" },
        update: { role: "ADMIN" }
      });
    }

    return workspace;
  });
};

export const getMyWorkspace = async (userId: number) => {
  return prisma.workspace.findUnique({ where: { ownerId: userId }, include: { team: true } });
};

export const renameWorkspace = async (userId: number, newName: string) => {
  // Only owner can rename
  const ws = await prisma.workspace.findUnique({ where: { ownerId: userId } });
  if (!ws) throw new Error("Workspace not found");
  return prisma.workspace.update({ where: { id: ws.id }, data: { name: newName } });
};

export const renameTeam = async (userId: number, newName: string) => {
  const ws = await prisma.workspace.findUnique({ where: { ownerId: userId }, include: { team: true } });
  if (!ws || !ws.team) throw new Error("Team not found");
  // owner implied admin
  return prisma.team.update({ where: { id: ws.team.id }, data: { name: newName } });
};

export const getMyTeam = async (userId: number) => {
  // Get all team memberships for the user with their roles
  const memberships = await prisma.teamMembership.findMany({ 
    where: { userId }, 
    include: { 
      team: { 
        include: { 
          workspace: true 
        } 
      } 
    } 
  });
  
  if (!memberships || memberships.length === 0) return { teams: [] };
  
  // Return teams with role information
  const teams = memberships.map(membership => ({
    ...membership.team,
    role: membership.role, // ADMIN or MEMBER
    membershipId: membership.id,
    joinedAt: membership.createdAt
  }));
  
  return {
    teams,
    totalTeams: teams.length,
    adminTeams: teams.filter(t => t.role === "ADMIN"),
    memberTeams: teams.filter(t => t.role === "MEMBER")
  };
};

export const isAdminOfOwnTeam = async (userId: number): Promise<boolean> => {
  const ws = await prisma.workspace.findUnique({ where: { ownerId: userId }, include: { team: true } });
  if (!ws || !ws.team) return false;
  const admin = await prisma.teamMembership.findUnique({ where: { userId_teamId: { userId, teamId: ws.team.id } } });
  return !!admin && admin.role === "ADMIN";
};

export const createWorkspaceAndTeam = async (userId: number) => {
  // Get user details from database
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, username: true }
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Check if workspace already exists
  const existingWorkspace = await prisma.workspace.findUnique({ 
    where: { ownerId: userId },
    include: { team: true }
  });

  if (existingWorkspace) {
    // Return existing workspace and team
    return {
      workspace: existingWorkspace,
      team: existingWorkspace.team,
      created: false,
      message: "Workspace and team already exist"
    };
  }

  // Create workspace and team
  const workspaceData = await ensureWorkspaceAndTeamForUser(user.id, user.name, user.username);
  
  return {
    workspace: workspaceData,
    team: workspaceData.team,
    created: true,
    message: "Workspace and team created successfully"
  };
};


