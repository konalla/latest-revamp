import prisma from "../config/prisma.js";
import { subscriptionService } from "./subscription.service.js";

// Helper function to get workspace and team limits based on subscription
export const getWorkspaceLimits = async (userId: number): Promise<{
  maxWorkspaces: number;
  maxTeamsPerWorkspace: number;
  canCreateWorkspace: boolean;
  canCreateTeam: boolean;
  planName: string | null;
  status: string;
}> => {
  try {
    const subscription = await subscriptionService.getUserSubscription(userId);
    const updatedSubscription = await subscriptionService.updateSubscriptionStatus(subscription.id);
    
    const planName = updatedSubscription.subscriptionPlan?.name || null;
    const status = updatedSubscription.status || "TRIAL";
    
    // Check if user has plans with workspace limits
    const hasEssentialTwenty = planName === "essential_twenty";
    const hasBusinessPro = planName === "business_pro";
    const hasFocusMaster = planName === "focus_master";
    const hasPerformanceFounder = planName === "performance_founder";
    const hasWorkspacePlan = hasEssentialTwenty || hasBusinessPro || hasFocusMaster || hasPerformanceFounder;
    
    // Default limits (no subscription or other plans)
    let maxWorkspaces = 1; // Only default workspace
    let maxTeamsPerWorkspace = 5;
    let canCreateWorkspace = false;
    let canCreateTeam = false;
    
    if (hasWorkspacePlan) {
      if (status === "ACTIVE") {
        // Full access (including during 14-day trial for all paid plans)
        if (hasEssentialTwenty) {
          maxWorkspaces = 3; // 1 default + 2 more
          maxTeamsPerWorkspace = 5;
        } else if (hasBusinessPro) {
          maxWorkspaces = 5; // 1 default + 4 more
          maxTeamsPerWorkspace = 7;
        } else if (hasFocusMaster) {
          maxWorkspaces = 7; // 1 default + 6 more
          maxTeamsPerWorkspace = 5;
        } else if (hasPerformanceFounder) {
          maxWorkspaces = 12; // 1 default + 11 more
          maxTeamsPerWorkspace = 5;
        }
        canCreateWorkspace = true;
        canCreateTeam = true;
      } else if (status === "GRACE_PERIOD") {
        // Grace period: allow team creation but not workspace creation
        if (hasEssentialTwenty) {
          maxWorkspaces = 3;
          maxTeamsPerWorkspace = 5;
        } else if (hasBusinessPro) {
          maxWorkspaces = 5;
          maxTeamsPerWorkspace = 7;
        } else if (hasFocusMaster) {
          maxWorkspaces = 7;
          maxTeamsPerWorkspace = 5;
        } else if (hasPerformanceFounder) {
          maxWorkspaces = 12;
          maxTeamsPerWorkspace = 5;
        }
        canCreateWorkspace = false;
        canCreateTeam = true;
      } else {
        // EXPIRED, CANCELED, etc. - only default workspace with 5 teams, but can create teams up to limit
        maxWorkspaces = 1;
        maxTeamsPerWorkspace = 5;
        canCreateWorkspace = false;
        canCreateTeam = true; // Can still create teams in default workspace up to 5
      }
    } else {
      // No workspace plan subscription
      // Only default workspace with 5 teams, but can create teams up to limit
      maxWorkspaces = 1;
      maxTeamsPerWorkspace = 5;
      canCreateWorkspace = false;
      canCreateTeam = true; // Can create teams in default workspace up to 5
    }
    
    return {
      maxWorkspaces,
      maxTeamsPerWorkspace,
      canCreateWorkspace,
      canCreateTeam,
      planName,
      status
    };
  } catch (error: any) {
    console.error("Error getting workspace limits:", error);
    // Default to most restrictive limits on error
    return {
      maxWorkspaces: 1,
      maxTeamsPerWorkspace: 5,
      canCreateWorkspace: false,
      canCreateTeam: false,
      planName: null,
      status: "UNKNOWN"
    };
  }
};

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

      // Determine workspace-level role
      let workspaceUserRole: "OWNER" | "WORKSPACE_MANAGER" | "TEAM_MANAGER";
      if (isOwner) {
        workspaceUserRole = "OWNER";
      } else if (isWorkspaceManager) {
        workspaceUserRole = "WORKSPACE_MANAGER";
      } else {
        workspaceUserRole = "TEAM_MANAGER";
      }

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
            },
            memberships: {
              where: {
                userId: userId,
                status: "ACTIVE"
              },
              select: {
                role: true,
                status: true
              }
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

      // Add user role to each team
      const teamsWithRoles = teams.map(team => {
        const userMembership = team.memberships?.[0];
        let teamUserRole: "OWNER" | "WORKSPACE_MANAGER" | "TEAM_MANAGER" | "ADMIN" | "MEMBER" | null = null;
        
        if (userMembership) {
          // User has direct team membership
          if (userMembership.role === "TEAM_MANAGER") {
            teamUserRole = "TEAM_MANAGER";
          } else if (userMembership.role === "ADMIN") {
            teamUserRole = "ADMIN";
          } else {
            teamUserRole = "MEMBER";
          }
        } else if (isOwner || isWorkspaceManager) {
          // User doesn't have direct team membership but has workspace-level permissions
          // Inherit workspace role at team level
          if (isOwner) {
            teamUserRole = "OWNER";
          } else {
            teamUserRole = "WORKSPACE_MANAGER";
          }
        }

        // Remove memberships from response (we only needed it to determine role)
        const { memberships, ...teamWithoutMemberships } = team;
        
        return {
          ...teamWithoutMemberships,
          userRole: teamUserRole
        };
      });

      return {
        ...workspace,
        userRole: workspaceUserRole,
        teams: teamsWithRoles
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

  // Determine workspace-level role
  let workspaceUserRole: "OWNER" | "WORKSPACE_MANAGER" | "TEAM_MANAGER";
  if (isOwner) {
    workspaceUserRole = "OWNER";
  } else if (isWorkspaceManager) {
    workspaceUserRole = "WORKSPACE_MANAGER";
  } else {
    workspaceUserRole = "TEAM_MANAGER";
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
        },
        memberships: {
          where: {
            userId: userId,
            status: "ACTIVE"
          },
          select: {
            role: true,
            status: true
          }
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

  // Add user role to each team
  const teamsWithRoles = teams.map(team => {
    const userMembership = team.memberships?.[0];
    let teamUserRole: "OWNER" | "WORKSPACE_MANAGER" | "TEAM_MANAGER" | "ADMIN" | "MEMBER" | null = null;
    
    if (userMembership) {
      // User has direct team membership
      if (userMembership.role === "TEAM_MANAGER") {
        teamUserRole = "TEAM_MANAGER";
      } else if (userMembership.role === "ADMIN") {
        teamUserRole = "ADMIN";
      } else {
        teamUserRole = "MEMBER";
      }
    } else if (isOwner || isWorkspaceManager) {
      // User doesn't have direct team membership but has workspace-level permissions
      // Inherit workspace role at team level
      if (isOwner) {
        teamUserRole = "OWNER";
      } else {
        teamUserRole = "WORKSPACE_MANAGER";
      }
    }

    // Remove memberships from response (we only needed it to determine role)
    const { memberships, ...teamWithoutMemberships } = team;
    
    return {
      ...teamWithoutMemberships,
      userRole: teamUserRole
    };
  });

  return {
    ...workspace,
    userRole: workspaceUserRole,
    teams: teamsWithRoles
  };
};

// Create a new workspace (without default team)
export const createWorkspace = async (userId: number, name: string) => {
  if (!name || !name.trim()) {
    throw new Error("Workspace name is required");
  }

  // Check subscription limits
  const limits = await getWorkspaceLimits(userId);
  
  if (!limits.canCreateWorkspace) {
    const planName = limits.planName;
    const hasWorkspacePlan = planName === "essential_twenty" || planName === "business_pro" || planName === "focus_master" || planName === "performance_founder";
    if (hasWorkspacePlan) {
      if (limits.status === "GRACE_PERIOD") {
        throw new Error("Cannot create new workspaces during grace period. Please renew your subscription to create more workspaces.");
      } else {
        throw new Error("Your subscription has expired. Please renew your subscription to create more workspaces.");
      }
    } else {
      throw new Error("Workspace creation is only available with Essential Twenty, Business Pro, Focus Master, or Performance Founder subscriptions. Please upgrade to create additional workspaces.");
    }
  }

  // Count existing workspaces owned by user
  const existingWorkspacesCount = await prisma.workspace.count({
    where: { ownerId: userId }
  });

  // Check if user has reached workspace limit
  if (existingWorkspacesCount >= limits.maxWorkspaces) {
    const planName = limits.planName;
    if (planName === "essential_twenty") {
      throw new Error(`You've reached your workspace limit (${limits.maxWorkspaces} workspaces). Upgrade to Business Pro, Focus Master, or Performance Founder to create more workspaces.`);
    } else if (planName === "business_pro") {
      throw new Error(`You've reached your workspace limit (${limits.maxWorkspaces} workspaces). Upgrade to Focus Master or Performance Founder to create more workspaces.`);
    } else if (planName === "focus_master") {
      throw new Error(`You've reached your workspace limit (${limits.maxWorkspaces} workspaces). Upgrade to Performance Founder to create up to 12 workspaces.`);
    } else if (planName === "performance_founder") {
      throw new Error(`You've reached your workspace limit (${limits.maxWorkspaces} workspaces).`);
    } else {
      throw new Error("You can only have 1 workspace (the default workspace). Upgrade to Essential Twenty, Business Pro, Focus Master, or Performance Founder to create additional workspaces.");
    }
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

  const workspace = await prisma.workspace.create({
    data: {
      name: name.trim(),
      ownerId: userId
    },
    include: { teams: true }
  });

  // Increment workspace counter for tracking
  const { subscriptionService } = await import("./subscription.service.js");
  await subscriptionService.incrementWorkspaceCount(userId);

  return workspace;
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


