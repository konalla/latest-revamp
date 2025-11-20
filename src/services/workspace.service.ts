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
    // Get the first workspace for the user (for backward compatibility)
    let workspace = await tx.workspace.findFirst({ 
      where: { ownerId: userId }, 
      include: { teams: true },
      orderBy: { createdAt: "asc" }
    });
    
    if (!workspace) {
      // Create first workspace with default team
      const { workspaceBase, teamBase } = generateBaseNames(name, username);
      const workspaceName = await findAvailableName("workspace", workspaceBase);
      const createdWorkspace = await tx.workspace.create({ data: { name: workspaceName, ownerId: userId } });

      const teamName = await findAvailableName("team", teamBase);
      const team = await tx.team.create({ data: { name: teamName, workspaceId: createdWorkspace.id } });

      // Owner becomes ADMIN member of their team
      await tx.teamMembership.create({ data: { userId, teamId: team.id, role: "ADMIN", status: "ACTIVE" } });

      // Fetch the workspace with teams included
      workspace = await tx.workspace.findUnique({ where: { id: createdWorkspace.id }, include: { teams: true } });
      if (!workspace) throw new Error("Failed to create workspace");
    } else if (!workspace.teams || workspace.teams.length === 0) {
      // If workspace exists but has no teams, create default team
      const { teamBase } = generateBaseNames(name, username);
      const teamName = await findAvailableName("team", teamBase);
      const team = await tx.team.create({ data: { name: teamName, workspaceId: workspace.id } });
      await tx.teamMembership.upsert({
        where: { userId_teamId: { userId, teamId: team.id } },
        create: { userId, teamId: team.id, role: "ADMIN", status: "ACTIVE" },
        update: { role: "ADMIN" }
      });
      // Fetch the workspace with teams included
      workspace = await tx.workspace.findUnique({ where: { id: workspace.id }, include: { teams: true } });
      if (!workspace) throw new Error("Failed to update workspace");
    } else {
      // Ensure admin membership exists for the first team (original team)
      const firstTeam = workspace.teams[0];
      if (firstTeam) {
        await tx.teamMembership.upsert({
          where: { userId_teamId: { userId, teamId: firstTeam.id } },
          create: { userId, teamId: firstTeam.id, role: "ADMIN", status: "ACTIVE" },
          update: { role: "ADMIN" }
        });
      }
    }

    return workspace;
  });
};

// Get first workspace (for backward compatibility)
export const getMyWorkspace = async (userId: number) => {
  return prisma.workspace.findFirst({ 
    where: { ownerId: userId }, 
    include: { teams: true },
    orderBy: { createdAt: "asc" }
  });
};

// Get all workspaces where user is owner OR has ADMIN/TEAM_MANAGER role in at least one team OR is workspace manager
export const getAllWorkspaces = async (userId: number) => {
  // Get all workspaces owned by user
  const ownedWorkspaces = await prisma.workspace.findMany({
    where: { ownerId: userId },
    select: { id: true }
  });

  // Get all teams where user is ADMIN or TEAM_MANAGER and get their workspace IDs
  const adminOrManagerTeams = await prisma.team.findMany({
    where: {
      memberships: {
        some: {
          userId: userId,
          role: {
            in: ["ADMIN", "TEAM_MANAGER"]
          },
          status: "ACTIVE"
        }
      }
    },
    select: {
      workspaceId: true
    },
    distinct: ["workspaceId"]
  });

  // Get all workspaces where user is workspace manager
  const workspaceManagerMemberships = await prisma.workspaceMembership.findMany({
    where: { userId: userId },
    select: { workspaceId: true }
  });

  // Get unique workspace IDs from teams and workspace managers
  const workspaceIdsFromTeams = adminOrManagerTeams.map(t => t.workspaceId);
  const workspaceIdsFromManagers = workspaceManagerMemberships.map(m => m.workspaceId);
  
  // Combine owned workspace IDs, workspace IDs from teams, and workspace IDs from managers, remove duplicates
  const allWorkspaceIds = new Set([
    ...ownedWorkspaces.map(w => w.id),
    ...workspaceIdsFromTeams,
    ...workspaceIdsFromManagers
  ]);

  // Get all unique workspaces
  const allWorkspaces = await prisma.workspace.findMany({
    where: {
      id: { in: Array.from(allWorkspaceIds) }
    },
    orderBy: { createdAt: "asc" }
  });

  // For each workspace, get teams based on user's role
  const workspacesWithTeams = await Promise.all(
    allWorkspaces.map(async (workspace) => {
      const isOwner = workspace.ownerId === userId;
      const isWorkspaceManager = workspaceIdsFromManagers.includes(workspace.id);

      let teams;
      if (isOwner || isWorkspaceManager) {
        // Owner or workspace manager can see all teams
        teams = await prisma.team.findMany({
          where: {
            workspaceId: workspace.id
          },
          include: {
            _count: {
              select: { memberships: true }
            }
          },
          orderBy: { createdAt: "asc" }
        });
      } else {
        // Non-owner/non-workspace-manager can only see teams where they are ADMIN or TEAM_MANAGER
        teams = await prisma.team.findMany({
          where: {
            workspaceId: workspace.id,
            memberships: {
              some: {
                userId: userId,
                role: {
                  in: ["ADMIN", "TEAM_MANAGER"]
                },
                status: "ACTIVE"
              }
            }
          },
          include: {
            _count: {
              select: { memberships: true }
            },
            memberships: {
              where: {
                userId: userId,
                role: {
                  in: ["ADMIN", "TEAM_MANAGER"]
                }
              },
              select: {
                role: true,
                status: true
              }
            }
          },
          orderBy: { createdAt: "asc" }
        });
      }

      return {
        ...workspace,
        teams: teams
      };
    })
  );

  return workspacesWithTeams;
};

// Get workspace by ID (verify ownership, workspace manager role, or ADMIN/TEAM_MANAGER role in at least one team)
export const getWorkspaceById = async (userId: number, workspaceId: number) => {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId }
  });

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  const isOwner = workspace.ownerId === userId;

  // Check if user is workspace manager
  const isWorkspaceManager = await prisma.workspaceMembership.findUnique({
    where: {
      userId_workspaceId: { userId, workspaceId }
    }
  });

  // If user is not the owner or workspace manager, check if they are ADMIN or TEAM_MANAGER in any team
  if (!isOwner && !isWorkspaceManager) {
    const hasAdminOrManagerRole = await prisma.teamMembership.findFirst({
      where: {
        userId: userId,
        role: {
          in: ["ADMIN", "TEAM_MANAGER"]
        },
        status: "ACTIVE",
        team: {
          workspaceId: workspaceId
        }
      }
    });

    if (!hasAdminOrManagerRole) {
      throw new Error("You don't have permission to access this workspace");
    }
  }

  // Get teams based on user's role
  let teams;
  if (isOwner || isWorkspaceManager) {
    // Owner or workspace manager can see all teams
    teams = await prisma.team.findMany({
      where: {
        workspaceId: workspaceId
      },
      include: {
        _count: {
          select: { memberships: true }
        }
      },
      orderBy: { createdAt: "asc" }
    });
  } else {
    // Non-owner/non-workspace-manager can only see teams where they are ADMIN or TEAM_MANAGER
    teams = await prisma.team.findMany({
      where: {
        workspaceId: workspaceId,
        memberships: {
          some: {
            userId: userId,
            role: {
              in: ["ADMIN", "TEAM_MANAGER"]
            },
            status: "ACTIVE"
          }
        }
      },
      include: {
        _count: {
          select: { memberships: true }
        },
        memberships: {
          where: {
            userId: userId,
            role: {
              in: ["ADMIN", "TEAM_MANAGER"]
            }
          },
          select: {
            role: true,
            status: true
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });
  }

  return {
    ...workspace,
    teams: teams
  };
};

// Create a new workspace (without default team)
export const createWorkspace = async (userId: number, name: string) => {
  if (!name || !name.trim()) {
    throw new Error("Workspace name is required");
  }

  // Check if workspace name already exists for this user
  const existingWorkspace = await prisma.workspace.findFirst({
    where: {
      ownerId: userId,
      name: name.trim()
    }
  });

  if (existingWorkspace) {
    throw new Error("A workspace with this name already exists");
  }

  return prisma.workspace.create({
    data: {
      name: name.trim(),
      ownerId: userId
    },
    include: { teams: true }
  });
};

// Update workspace (rename)
export const updateWorkspace = async (userId: number, workspaceId: number, newName: string) => {
  if (!newName || !newName.trim()) {
    throw new Error("Workspace name is required");
  }

  // Verify ownership
  const workspace = await getWorkspaceById(userId, workspaceId);

  // Check if another workspace with this name exists for this user
  const existingWorkspace = await prisma.workspace.findFirst({
    where: {
      ownerId: userId,
      name: newName.trim(),
      id: { not: workspaceId }
    }
  });

  if (existingWorkspace) {
    throw new Error("A workspace with this name already exists");
  }

  return prisma.workspace.update({
    where: { id: workspaceId },
    data: { name: newName.trim() },
    include: { teams: true }
  });
};

// Delete workspace
export const deleteWorkspace = async (userId: number, workspaceId: number) => {
  // Verify ownership
  await getWorkspaceById(userId, workspaceId);

  // Delete workspace (cascade will handle teams and related data)
  await prisma.workspace.delete({
    where: { id: workspaceId }
  });

  return { message: "Workspace deleted successfully" };
};

// Legacy function for backward compatibility (renames first workspace)
export const renameWorkspace = async (userId: number, newName: string) => {
  const ws = await getMyWorkspace(userId);
  if (!ws) throw new Error("Workspace not found");
  return updateWorkspace(userId, ws.id, newName);
};

export const renameTeam = async (userId: number, newName: string) => {
  const ws = await getMyWorkspace(userId);
  if (!ws || !ws.teams || ws.teams.length === 0) throw new Error("Team not found");
  // owner implied admin - rename the first team (original team)
  const firstTeam = ws.teams[0];
  if (!firstTeam) throw new Error("Team not found");
  return prisma.team.update({ where: { id: firstTeam.id }, data: { name: newName } });
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
  
  // Return teams with role and status information
  const teams = memberships.map(membership => ({
    ...membership.team,
    role: membership.role, // ADMIN or MEMBER
    status: membership.status, // ACTIVE, INACTIVE, SUSPENDED, UNDER_REVIEW
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
  const ws = await getMyWorkspace(userId);
  if (!ws || !ws.teams || ws.teams.length === 0) return false;
  const firstTeam = ws.teams[0];
  if (!firstTeam) return false;
  const admin = await prisma.teamMembership.findUnique({ where: { userId_teamId: { userId, teamId: firstTeam.id } } });
  return !!admin && admin.role === "ADMIN";
};

// Legacy function - creates first workspace with team if it doesn't exist
export const createWorkspaceAndTeam = async (userId: number) => {
  // Get user details from database
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, username: true }
  });

  if (!user) {
    throw new Error("User not found");
  }

  // Check if first workspace already exists
  const existingWorkspace = await getMyWorkspace(userId);

  if (existingWorkspace) {
    // Return existing workspace and first team
    return {
      workspace: existingWorkspace,
      team: existingWorkspace.teams && existingWorkspace.teams.length > 0 ? existingWorkspace.teams[0] : null,
      created: false,
      message: "Workspace and team already exist"
    };
  }

  // Create workspace and team
  const workspaceData = await ensureWorkspaceAndTeamForUser(user.id, user.name, user.username);
  
  if (!workspaceData) {
    throw new Error("Failed to create workspace");
  }
  
  return {
    workspace: workspaceData,
    team: workspaceData.teams && workspaceData.teams.length > 0 ? workspaceData.teams[0] : null,
    created: true,
    message: "Workspace and team created successfully"
  };
};

// Assign workspace manager
export const assignWorkspaceManager = async (
  userId: number, 
  workspaceId: number, 
  identifier: string | number // username, email, or userId
) => {
  // Verify user has permission (workspace owner/admin only)
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId }
  });

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  if (workspace.ownerId !== userId) {
    throw new Error("Only workspace owner/admin can assign workspace managers");
  }

  // Find user by username, email, or userId
  let userToAssign;
  if (typeof identifier === 'number') {
    // If it's a number, treat as userId
    userToAssign = await prisma.user.findUnique({
      where: { id: identifier }
    });
  } else {
    // If it's a string, try username first, then email
    userToAssign = await prisma.user.findFirst({
      where: {
        OR: [
          { username: identifier },
          { email: identifier }
        ]
      }
    });
  }

  if (!userToAssign) {
    throw new Error("User not found. Please provide a valid username, email, or user ID.");
  }

  // Check if already a workspace manager
  const existing = await prisma.workspaceMembership.findUnique({
    where: {
      userId_workspaceId: { userId: userToAssign.id, workspaceId }
    }
  });

  if (existing) {
    throw new Error("User is already a workspace manager");
  }

  // Create workspace membership
  await prisma.workspaceMembership.create({
    data: {
      userId: userToAssign.id,
      workspaceId: workspaceId,
      role: "WORKSPACE_MANAGER"
    }
  });

  return { 
    message: "Workspace manager assigned successfully",
    user: {
      id: userToAssign.id,
      username: userToAssign.username,
      name: userToAssign.name,
      email: userToAssign.email
    }
  };
};

// Remove workspace manager
export const removeWorkspaceManager = async (
  userId: number, 
  workspaceId: number, 
  identifier: string | number // username, email, or userId
) => {
  // Verify user has permission (workspace owner/admin only)
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId }
  });

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  if (workspace.ownerId !== userId) {
    throw new Error("Only workspace owner/admin can remove workspace managers");
  }

  // Find user by username, email, or userId
  let userToRemove;
  if (typeof identifier === 'number') {
    // If it's a number, treat as userId
    userToRemove = await prisma.user.findUnique({
      where: { id: identifier }
    });
  } else {
    // If it's a string, try username first, then email
    userToRemove = await prisma.user.findFirst({
      where: {
        OR: [
          { username: identifier },
          { email: identifier }
        ]
      }
    });
  }

  if (!userToRemove) {
    throw new Error("User not found. Please provide a valid username, email, or user ID.");
  }

  // Check if membership exists
  const membership = await prisma.workspaceMembership.findUnique({
    where: {
      userId_workspaceId: { userId: userToRemove.id, workspaceId }
    }
  });

  if (!membership) {
    throw new Error("User is not a workspace manager");
  }

  // Remove workspace membership
  await prisma.workspaceMembership.delete({
    where: {
      userId_workspaceId: { userId: userToRemove.id, workspaceId }
    }
  });

  return { 
    message: "Workspace manager removed successfully",
    user: {
      id: userToRemove.id,
      username: userToRemove.username,
      name: userToRemove.name,
      email: userToRemove.email
    }
  };
};

// Get workspace managers
export const getWorkspaceManagers = async (userId: number, workspaceId: number) => {
  // Verify user has permission to view workspace
  await getWorkspaceById(userId, workspaceId);

  const memberships = await prisma.workspaceMembership.findMany({
    where: { workspaceId },
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
  });

  return memberships.map(m => ({
    id: m.user.id,
    username: m.user.username,
    name: m.user.name,
    email: m.user.email,
    role: m.role,
    assignedAt: m.createdAt
  }));
};

// Search users for workspace manager assignment
export const searchUsersForWorkspaceManager = async (
  userId: number,
  workspaceId: number,
  query: string,
  limit = 20
) => {
  // Verify user has permission (workspace owner/admin or workspace manager)
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId }
  });

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  // Check if user is workspace owner
  const isOwner = workspace.ownerId === userId;
  
  if (!isOwner) {
    // Check if user is workspace manager
    const isWorkspaceManager = await prisma.workspaceMembership.findUnique({
      where: {
        userId_workspaceId: { userId, workspaceId }
      }
    });

    if (!isWorkspaceManager) {
      throw new Error("Only workspace owner/admin or workspace manager can search for workspace managers");
    }
  }

  // Get existing workspace managers
  const existingManagers = await prisma.workspaceMembership.findMany({
    where: { workspaceId },
    select: { userId: true }
  });
  const existingManagerIds = new Set(existingManagers.map(m => m.userId));

  // Search users by username or email
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

  // Return all users excluding existing workspace managers
  return users.filter(u => !existingManagerIds.has(u.id));
};


