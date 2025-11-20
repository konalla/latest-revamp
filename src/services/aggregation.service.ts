/**
 * Aggregation Service
 * 
 * Aggregates individual user data into team-level views
 * Respects data classification and ensures no individual data is exposed
 */

import prisma from "../config/prisma.js";
import analyticsService from "./analytics.service.js";
import { CognitiveLoadService } from "./cognitive-load.service.js";

export class AggregationService {
  /**
   * Aggregate productivity analytics for a team
   */
  async aggregateTeamProductivity(teamId: number, days: number = 30): Promise<any> {
    // Get all active team members
    const memberships = await prisma.teamMembership.findMany({
      where: {
        teamId,
        status: "ACTIVE"
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    if (memberships.length === 0) {
      return {
        teamId,
        memberCount: 0,
        aggregatedMetrics: {
          averageTaskCompletionRate: 0,
          totalTasksCompleted: 0,
          totalTasksCount: 0,
          averageTaskDuration: 0
        },
        note: "No active team members"
      };
    }

    const memberIds = memberships.map(m => m.user.id);
    
    // Get productivity data for all team members
    const productivityData = await Promise.all(
      memberIds.map(userId => analyticsService.getProductivityAnalytics(userId, days))
    );

    // Aggregate metrics
    let totalTasksCompleted = 0;
    let totalTasksCount = 0;
    let totalDuration = 0;
    let completedCount = 0;
    const tasksByCategory: Record<string, number> = {};

    productivityData.forEach(data => {
      totalTasksCompleted += data.tasksCompletedCount || 0;
      totalTasksCount += data.totalTasksCount || 0;
      totalDuration += (data.averageTaskDuration || 0) * (data.tasksCompletedCount || 0);
      completedCount += data.tasksCompletedCount || 0;

      // Aggregate category distribution
      if (data.tasksByCategory) {
        Object.entries(data.tasksByCategory).forEach(([category, count]) => {
          tasksByCategory[category] = (tasksByCategory[category] || 0) + (count as number);
        });
      }
    });

    const averageTaskCompletionRate = totalTasksCount > 0 
      ? totalTasksCompleted / totalTasksCount 
      : 0;
    
    const averageTaskDuration = completedCount > 0 
      ? totalDuration / completedCount 
      : 0;

    // Find most productive category
    let mostProductiveCategory = "Uncategorized";
    let maxCategoryCount = 0;
    Object.entries(tasksByCategory).forEach(([category, count]) => {
      if (count > maxCategoryCount) {
        maxCategoryCount = count;
        mostProductiveCategory = category;
      }
    });

    return {
      teamId,
      memberCount: memberships.length,
      aggregatedMetrics: {
        averageTaskCompletionRate: Math.round(averageTaskCompletionRate * 100) / 100,
        totalTasksCompleted,
        totalTasksCount,
        averageTaskDuration: Math.round(averageTaskDuration * 100) / 100,
        tasksByCategory,
        mostProductiveCategory
      },
      dataClassification: "PERSONAL",
      note: "Aggregated data - individual member data not shown",
      isAggregated: true
    };
  }

  /**
   * Aggregate focus analytics for a team
   */
  async aggregateTeamFocus(teamId: number, days: number = 30): Promise<any> {
    // Get all active team members
    const memberships = await prisma.teamMembership.findMany({
      where: {
        teamId,
        status: "ACTIVE"
      }
    });

    if (memberships.length === 0) {
      return {
        teamId,
        memberCount: 0,
        aggregatedMetrics: {
          averageFocusSessionDuration: 0,
          totalFocusSessionTime: 0,
          focusSessionCount: 0
        },
        note: "No active team members"
      };
    }

    const memberIds = memberships.map(m => m.userId);
    
    // Get focus data for all team members
    const focusData = await Promise.all(
      memberIds.map(userId => analyticsService.getFocusAnalytics(userId, days))
    );

    // Aggregate metrics (only PERSONAL data, no SENSITIVE)
    let totalFocusSessionTime = 0;
    let totalSessions = 0;
    let totalTasksCompleted = 0;

    focusData.forEach(data => {
      totalFocusSessionTime += data.totalFocusSessionTime || 0;
      totalSessions += data.focusSessionCount || 0;
      totalTasksCompleted += data.tasksCompletedDuringFocus || 0;
    });

    const averageFocusSessionDuration = totalSessions > 0
      ? totalFocusSessionTime / totalSessions
      : 0;

    const averageTaskCompletionRate = totalSessions > 0
      ? totalTasksCompleted / totalSessions
      : 0;

    return {
      teamId,
      memberCount: memberships.length,
      aggregatedMetrics: {
        averageFocusSessionDuration: Math.round(averageFocusSessionDuration * 100) / 100,
        totalFocusSessionTime,
        focusSessionCount: totalSessions,
        totalTasksCompletedDuringFocus: totalTasksCompleted,
        averageTaskCompletionRate: Math.round(averageTaskCompletionRate * 100) / 100
      },
      dataClassification: "PERSONAL",
      note: "Aggregated data - individual member data and sensitive metrics (mood, energy, cognitive flow) not shown",
      isAggregated: true
    };
  }

  /**
   * Aggregate cognitive load for a team (fully anonymized)
   */
  async aggregateTeamCognitiveLoad(teamId: number): Promise<any> {
    // Get all active team members
    const memberships = await prisma.teamMembership.findMany({
      where: {
        teamId,
        status: "ACTIVE"
      }
    });

    if (memberships.length === 0) {
      return {
        teamId,
        memberCount: 0,
        aggregatedMetrics: {
          averageWorkloadScore: 0,
          averageBurnoutRisk: 0,
          membersAtRisk: 0,
          membersOptimal: 0,
          membersHeavy: 0
        },
        note: "No active team members"
      };
    }

    const memberIds = memberships.map(m => m.userId);
    const cognitiveLoadService = new CognitiveLoadService();
    
    // Get cognitive load data for all team members
    const cognitiveData = await Promise.all(
      memberIds.map(async (userId) => {
        try {
          const data = await cognitiveLoadService.getUserCognitiveLoadMeter(userId);
          return {
            workloadScore: data.currentWorkloadScore || 0,
            burnoutRisk: data.burnoutRiskScore || 0,
            burnoutLevel: data.burnoutRiskLevel || "NONE",
            status: data.currentStatus || "OPTIMAL"
          };
        } catch (error) {
          // If user doesn't have cognitive load data, skip
          return null;
        }
      })
    );

    // Filter out null values
    const validData = cognitiveData.filter(d => d !== null) as Array<{
      workloadScore: number;
      burnoutRisk: number;
      burnoutLevel: string;
      status: string;
    }>;

    if (validData.length === 0) {
      return {
        teamId,
        memberCount: memberships.length,
        aggregatedMetrics: {
          averageWorkloadScore: 0,
          averageBurnoutRisk: 0,
          membersAtRisk: 0,
          membersOptimal: 0,
          membersHeavy: 0
        },
        note: "No cognitive load data available for team members"
      };
    }

    // Calculate aggregated metrics (fully anonymized)
    let totalWorkloadScore = 0;
    let totalBurnoutRisk = 0;
    let membersAtRisk = 0;
    let membersOptimal = 0;
    let membersHeavy = 0;

    validData.forEach(data => {
      totalWorkloadScore += data.workloadScore;
      totalBurnoutRisk += data.burnoutRisk;

      // Count by burnout level (anonymized)
      // HIGH and SEVERE are considered "at risk"
      if (data.burnoutLevel === "HIGH" || data.burnoutLevel === "SEVERE") {
        membersAtRisk++;
      }

      // Count by status (anonymized)
      if (data.status === "OPTIMAL") {
        membersOptimal++;
      } else if (data.status === "HEAVY" || data.status === "OVERLOADED") {
        membersHeavy++;
      }
    });

    const averageWorkloadScore = Math.round(
      (totalWorkloadScore / validData.length) * 100
    ) / 100;
    
    const averageBurnoutRisk = Math.round(
      (totalBurnoutRisk / validData.length) * 100
    ) / 100;

    return {
      teamId,
      memberCount: memberships.length,
      aggregatedMetrics: {
        averageWorkloadScore,
        averageBurnoutRisk,
        membersAtRisk,      // Count only, no names/IDs
        membersOptimal,     // Count only
        membersHeavy        // Count only
      },
      dataClassification: "SENSITIVE",
      note: "Individual cognitive data not shown for privacy. Only aggregated, anonymized metrics.",
      isAggregated: true
    };
  }

  /**
   * Get team member list (basic info only - PERSONAL data)
   */
  async getTeamMembersBasicInfo(teamId: number): Promise<Array<{
    id: number;
    name: string;
    email: string;
    role: string;
  }>> {
    const memberships = await prisma.teamMembership.findMany({
      where: {
        teamId,
        status: "ACTIVE"
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    return memberships.map(m => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role
    }));
  }

  /**
   * Aggregate productivity analytics across all teams user manages (TEAM_MANAGER/ADMIN)
   * Deduplicates users across teams to avoid counting the same user's tasks multiple times
   */
  async aggregateMyTeamsProductivity(userId: number, days: number = 30): Promise<any> {
    // Get all teams where user is TEAM_MANAGER or ADMIN
    const memberships = await prisma.teamMembership.findMany({
      where: {
        userId,
        status: "ACTIVE",
        role: { in: ["TEAM_MANAGER", "ADMIN"] }
      },
      include: {
        team: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (memberships.length === 0) {
      return {
        teams: [],
        totalTeams: 0,
        aggregatedMetrics: {
          averageTaskCompletionRate: 0,
          totalTasksCompleted: 0,
          totalTasksCount: 0,
          averageTaskDuration: 0
        },
        note: "You are not a TEAM_MANAGER or ADMIN of any teams"
      };
    }

    const teamIds = memberships.map(m => m.teamId);
    
    // Get all unique members across all teams (deduplicate by userId)
    const allMemberships = await prisma.teamMembership.findMany({
      where: {
        teamId: { in: teamIds },
        status: "ACTIVE"
      },
      select: {
        userId: true
      }
    });

    // Get unique user IDs to avoid counting the same user's tasks multiple times
    const uniqueUserIds = [...new Set(allMemberships.map(m => m.userId))];
    
    if (uniqueUserIds.length === 0) {
      return {
        teams: memberships.map(m => ({
          teamId: m.team.id,
          teamName: m.team.name,
          role: m.role
        })),
        totalTeams: memberships.length,
        aggregatedMetrics: {
          averageTaskCompletionRate: 0,
          totalTasksCompleted: 0,
          totalTasksCount: 0,
          averageTaskDuration: 0,
          tasksByCategory: {},
          mostProductiveCategory: "Uncategorized",
          totalMemberCount: 0
        },
        dataClassification: "PERSONAL",
        note: "No active team members across all teams",
        isAggregated: true
      };
    }

    // Get productivity data for each unique user only once
    const productivityData = await Promise.all(
      uniqueUserIds.map(userId => analyticsService.getProductivityAnalytics(userId, days))
    );

    // Aggregate metrics from unique users only
    let totalTasksCompleted = 0;
    let totalTasksCount = 0;
    let totalDuration = 0;
    let completedCount = 0;
    const tasksByCategory: Record<string, number> = {};

    productivityData.forEach(data => {
      totalTasksCompleted += data.tasksCompletedCount || 0;
      totalTasksCount += data.totalTasksCount || 0;
      totalDuration += (data.averageTaskDuration || 0) * (data.tasksCompletedCount || 0);
      completedCount += data.tasksCompletedCount || 0;

      // Aggregate category distribution
      if (data.tasksByCategory) {
        Object.entries(data.tasksByCategory).forEach(([category, count]) => {
          tasksByCategory[category] = (tasksByCategory[category] || 0) + (count as number);
        });
      }
    });

    const averageTaskCompletionRate = totalTasksCount > 0 
      ? totalTasksCompleted / totalTasksCount 
      : 0;
    
    const averageTaskDuration = completedCount > 0 
      ? totalDuration / completedCount 
      : 0;

    // Find most productive category
    let mostProductiveCategory = "Uncategorized";
    let maxCategoryCount = 0;
    Object.entries(tasksByCategory).forEach(([category, count]) => {
      if (count > maxCategoryCount) {
        maxCategoryCount = count;
        mostProductiveCategory = category;
      }
    });

    return {
      teams: memberships.map(m => ({
        teamId: m.team.id,
        teamName: m.team.name,
        role: m.role
      })),
      totalTeams: memberships.length,
      aggregatedMetrics: {
        averageTaskCompletionRate: Math.round(averageTaskCompletionRate * 100) / 100,
        totalTasksCompleted,
        totalTasksCount,
        averageTaskDuration: Math.round(averageTaskDuration * 100) / 100,
        tasksByCategory,
        mostProductiveCategory,
        totalMemberCount: uniqueUserIds.length
      },
      dataClassification: "PERSONAL",
      note: "Aggregated data across all teams you manage - individual member data not shown. Each user's tasks are counted only once, even if they're in multiple teams.",
      isAggregated: true
    };
  }

  /**
   * Aggregate cognitive load across all teams user manages (TEAM_MANAGER/ADMIN)
   */
  async aggregateMyTeamsCognitiveLoad(userId: number): Promise<any> {
    // Get all teams where user is TEAM_MANAGER or ADMIN
    const memberships = await prisma.teamMembership.findMany({
      where: {
        userId,
        status: "ACTIVE",
        role: { in: ["TEAM_MANAGER", "ADMIN"] }
      },
      include: {
        team: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (memberships.length === 0) {
      return {
        teams: [],
        totalTeams: 0,
        aggregatedMetrics: {
          averageWorkloadScore: 0,
          averageBurnoutRisk: 0,
          membersAtRisk: 0,
          membersOptimal: 0,
          membersHeavy: 0
        },
        note: "You are not a TEAM_MANAGER or ADMIN of any teams"
      };
    }

    const teamIds = memberships.map(m => m.teamId);
    
    // Get aggregated data for each team
    const teamData = await Promise.all(
      teamIds.map(teamId => this.aggregateTeamCognitiveLoad(teamId))
    );

    // Aggregate across all teams
    let totalWorkloadScore = 0;
    let totalBurnoutRisk = 0;
    let totalMembersAtRisk = 0;
    let totalMembersOptimal = 0;
    let totalMembersHeavy = 0;
    let totalMemberCount = 0;
    let validTeamCount = 0;

    teamData.forEach(team => {
      if (team.aggregatedMetrics && team.memberCount > 0) {
        const metrics = team.aggregatedMetrics;
        totalWorkloadScore += (metrics.averageWorkloadScore || 0) * team.memberCount;
        totalBurnoutRisk += (metrics.averageBurnoutRisk || 0) * team.memberCount;
        totalMembersAtRisk += metrics.membersAtRisk || 0;
        totalMembersOptimal += metrics.membersOptimal || 0;
        totalMembersHeavy += metrics.membersHeavy || 0;
        totalMemberCount += team.memberCount;
        validTeamCount++;
      }
    });

    const averageWorkloadScore = totalMemberCount > 0
      ? Math.round((totalWorkloadScore / totalMemberCount) * 100) / 100
      : 0;
    
    const averageBurnoutRisk = totalMemberCount > 0
      ? Math.round((totalBurnoutRisk / totalMemberCount) * 100) / 100
      : 0;

    return {
      teams: memberships.map(m => ({
        teamId: m.team.id,
        teamName: m.team.name,
        role: m.role
      })),
      totalTeams: memberships.length,
      aggregatedMetrics: {
        averageWorkloadScore,
        averageBurnoutRisk,
        membersAtRisk: totalMembersAtRisk,      // Total count across all teams
        membersOptimal: totalMembersOptimal,     // Total count across all teams
        membersHeavy: totalMembersHeavy,         // Total count across all teams
        totalMemberCount
      },
      dataClassification: "SENSITIVE",
      note: "Individual cognitive data not shown for privacy. Only aggregated, anonymized metrics across all teams you manage.",
      isAggregated: true
    };
  }

  /**
   * Aggregate productivity analytics for all teams in a workspace
   * For workspace managers - combines all teams in their workspace
   */
  async aggregateWorkspaceProductivity(workspaceId: number, days: number = 30): Promise<any> {
    // Get all teams in the workspace
    const teams = await prisma.team.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true
      }
    });

    if (teams.length === 0) {
      return {
        workspaceId,
        teamCount: 0,
        aggregatedMetrics: {
          averageTaskCompletionRate: 0,
          totalTasksCompleted: 0,
          totalTasksCount: 0,
          averageTaskDuration: 0,
          tasksByCategory: {},
          mostProductiveCategory: "Uncategorized",
          totalMemberCount: 0
        },
        dataClassification: "PERSONAL",
        note: "No teams in this workspace",
        isAggregated: true
      };
    }

    const teamIds = teams.map(t => t.id);
    
    // Get all unique members across all teams in the workspace (deduplicate by userId)
    const allMemberships = await prisma.teamMembership.findMany({
      where: {
        teamId: { in: teamIds },
        status: "ACTIVE"
      },
      select: {
        userId: true
      }
    });

    // Get unique user IDs to avoid counting the same user's tasks multiple times
    const uniqueUserIds = [...new Set(allMemberships.map(m => m.userId))];
    
    if (uniqueUserIds.length === 0) {
      return {
        workspaceId,
        teamCount: teams.length,
        teams: teams.map(t => ({ id: t.id, name: t.name })),
        aggregatedMetrics: {
          averageTaskCompletionRate: 0,
          totalTasksCompleted: 0,
          totalTasksCount: 0,
          averageTaskDuration: 0,
          tasksByCategory: {},
          mostProductiveCategory: "Uncategorized",
          totalMemberCount: 0
        },
        dataClassification: "PERSONAL",
        note: "No active team members across all teams in workspace",
        isAggregated: true
      };
    }

    // Get productivity data for each unique user only once
    const productivityData = await Promise.all(
      uniqueUserIds.map(userId => analyticsService.getProductivityAnalytics(userId, days))
    );

    // Aggregate metrics from unique users only
    let totalTasksCompleted = 0;
    let totalTasksCount = 0;
    let totalDuration = 0;
    let completedCount = 0;
    const tasksByCategory: Record<string, number> = {};

    productivityData.forEach(data => {
      totalTasksCompleted += data.tasksCompletedCount || 0;
      totalTasksCount += data.totalTasksCount || 0;
      totalDuration += (data.averageTaskDuration || 0) * (data.tasksCompletedCount || 0);
      completedCount += data.tasksCompletedCount || 0;

      // Aggregate category distribution
      if (data.tasksByCategory) {
        Object.entries(data.tasksByCategory).forEach(([category, count]) => {
          tasksByCategory[category] = (tasksByCategory[category] || 0) + (count as number);
        });
      }
    });

    const averageTaskCompletionRate = totalTasksCount > 0 
      ? totalTasksCompleted / totalTasksCount 
      : 0;
    
    const averageTaskDuration = completedCount > 0 
      ? totalDuration / completedCount 
      : 0;

    // Find most productive category
    let mostProductiveCategory = "Uncategorized";
    let maxCategoryCount = 0;
    Object.entries(tasksByCategory).forEach(([category, count]) => {
      if (count > maxCategoryCount) {
        maxCategoryCount = count;
        mostProductiveCategory = category;
      }
    });

    return {
      workspaceId,
      teamCount: teams.length,
      teams: teams.map(t => ({ id: t.id, name: t.name })),
      aggregatedMetrics: {
        averageTaskCompletionRate: Math.round(averageTaskCompletionRate * 100) / 100,
        totalTasksCompleted,
        totalTasksCount,
        averageTaskDuration: Math.round(averageTaskDuration * 100) / 100,
        tasksByCategory,
        mostProductiveCategory,
        totalMemberCount: uniqueUserIds.length
      },
      dataClassification: "PERSONAL",
      note: "Aggregated data across all teams in workspace - individual member data not shown. Each user's tasks are counted only once, even if they're in multiple teams.",
      isAggregated: true
    };
  }

  /**
   * Aggregate productivity analytics across all workspaces
   * For admin/owner - combines all workspaces they own
   */
  async aggregateAllWorkspacesProductivity(userId: number, days: number = 30): Promise<any> {
    // Get all workspaces owned by user
    const workspaces = await prisma.workspace.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        name: true
      }
    });

    if (workspaces.length === 0) {
      return {
        workspaces: [],
        totalWorkspaces: 0,
        aggregatedMetrics: {
          averageTaskCompletionRate: 0,
          totalTasksCompleted: 0,
          totalTasksCount: 0,
          averageTaskDuration: 0,
          tasksByCategory: {},
          mostProductiveCategory: "Uncategorized",
          totalMemberCount: 0
        },
        dataClassification: "PERSONAL",
        note: "You don't own any workspaces",
        isAggregated: true
      };
    }

    const workspaceIds = workspaces.map(w => w.id);
    
    // Get all teams in all workspaces
    const teams = await prisma.team.findMany({
      where: {
        workspaceId: { in: workspaceIds }
      },
      select: {
        id: true,
        name: true,
        workspaceId: true
      }
    });

    if (teams.length === 0) {
      return {
        workspaces: workspaces.map(w => ({ id: w.id, name: w.name })),
        totalWorkspaces: workspaces.length,
        aggregatedMetrics: {
          averageTaskCompletionRate: 0,
          totalTasksCompleted: 0,
          totalTasksCount: 0,
          averageTaskDuration: 0,
          tasksByCategory: {},
          mostProductiveCategory: "Uncategorized",
          totalMemberCount: 0
        },
        dataClassification: "PERSONAL",
        note: "No teams in any workspace",
        isAggregated: true
      };
    }

    const teamIds = teams.map(t => t.id);
    
    // Get all unique members across all teams in all workspaces (deduplicate by userId)
    const allMemberships = await prisma.teamMembership.findMany({
      where: {
        teamId: { in: teamIds },
        status: "ACTIVE"
      },
      select: {
        userId: true
      }
    });

    // Get unique user IDs to avoid counting the same user's tasks multiple times
    const uniqueUserIds = [...new Set(allMemberships.map(m => m.userId))];
    
    if (uniqueUserIds.length === 0) {
      return {
        workspaces: workspaces.map(w => ({ id: w.id, name: w.name })),
        totalWorkspaces: workspaces.length,
        aggregatedMetrics: {
          averageTaskCompletionRate: 0,
          totalTasksCompleted: 0,
          totalTasksCount: 0,
          averageTaskDuration: 0,
          tasksByCategory: {},
          mostProductiveCategory: "Uncategorized",
          totalMemberCount: 0
        },
        dataClassification: "PERSONAL",
        note: "No active team members across all workspaces",
        isAggregated: true
      };
    }

    // Get productivity data for each unique user only once
    const productivityData = await Promise.all(
      uniqueUserIds.map(userId => analyticsService.getProductivityAnalytics(userId, days))
    );

    // Aggregate metrics from unique users only
    let totalTasksCompleted = 0;
    let totalTasksCount = 0;
    let totalDuration = 0;
    let completedCount = 0;
    const tasksByCategory: Record<string, number> = {};

    productivityData.forEach(data => {
      totalTasksCompleted += data.tasksCompletedCount || 0;
      totalTasksCount += data.totalTasksCount || 0;
      totalDuration += (data.averageTaskDuration || 0) * (data.tasksCompletedCount || 0);
      completedCount += data.tasksCompletedCount || 0;

      // Aggregate category distribution
      if (data.tasksByCategory) {
        Object.entries(data.tasksByCategory).forEach(([category, count]) => {
          tasksByCategory[category] = (tasksByCategory[category] || 0) + (count as number);
        });
      }
    });

    const averageTaskCompletionRate = totalTasksCount > 0 
      ? totalTasksCompleted / totalTasksCount 
      : 0;
    
    const averageTaskDuration = completedCount > 0 
      ? totalDuration / completedCount 
      : 0;

    // Find most productive category
    let mostProductiveCategory = "Uncategorized";
    let maxCategoryCount = 0;
    Object.entries(tasksByCategory).forEach(([category, count]) => {
      if (count > maxCategoryCount) {
        maxCategoryCount = count;
        mostProductiveCategory = category;
      }
    });

    // Group teams by workspace for response
    const teamsByWorkspace = workspaces.map(workspace => ({
      id: workspace.id,
      name: workspace.name,
      teams: teams
        .filter(t => t.workspaceId === workspace.id)
        .map(t => ({ id: t.id, name: t.name }))
    }));

    return {
      workspaces: teamsByWorkspace,
      totalWorkspaces: workspaces.length,
      aggregatedMetrics: {
        averageTaskCompletionRate: Math.round(averageTaskCompletionRate * 100) / 100,
        totalTasksCompleted,
        totalTasksCount,
        averageTaskDuration: Math.round(averageTaskDuration * 100) / 100,
        tasksByCategory,
        mostProductiveCategory,
        totalMemberCount: uniqueUserIds.length
      },
      dataClassification: "PERSONAL",
      note: "Aggregated data across all workspaces - individual member data not shown. Each user's tasks are counted only once, even if they're in multiple teams across different workspaces.",
      isAggregated: true
    };
  }

  /**
   * Aggregate focus analytics for all teams in a workspace
   * For workspace managers - combines all teams in their workspace
   */
  async aggregateWorkspaceFocus(workspaceId: number, days: number = 30): Promise<any> {
    // Get all teams in the workspace
    const teams = await prisma.team.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true
      }
    });

    if (teams.length === 0) {
      return {
        workspaceId,
        teamCount: 0,
        aggregatedMetrics: {
          averageFocusSessionDuration: 0,
          totalFocusSessionTime: 0,
          focusSessionCount: 0,
          totalTasksCompletedDuringFocus: 0,
          averageTaskCompletionRate: 0
        },
        dataClassification: "PERSONAL",
        note: "No teams in this workspace",
        isAggregated: true
      };
    }

    const teamIds = teams.map(t => t.id);
    
    // Get all unique members across all teams in the workspace (deduplicate by userId)
    const allMemberships = await prisma.teamMembership.findMany({
      where: {
        teamId: { in: teamIds },
        status: "ACTIVE"
      },
      select: {
        userId: true
      }
    });

    // Get unique user IDs to avoid counting the same user's focus sessions multiple times
    const uniqueUserIds = [...new Set(allMemberships.map(m => m.userId))];
    
    if (uniqueUserIds.length === 0) {
      return {
        workspaceId,
        teamCount: teams.length,
        teams: teams.map(t => ({ id: t.id, name: t.name })),
        aggregatedMetrics: {
          averageFocusSessionDuration: 0,
          totalFocusSessionTime: 0,
          focusSessionCount: 0,
          totalTasksCompletedDuringFocus: 0,
          averageTaskCompletionRate: 0
        },
        dataClassification: "PERSONAL",
        note: "No active team members across all teams in workspace",
        isAggregated: true
      };
    }

    // Get focus data for each unique user only once
    const focusData = await Promise.all(
      uniqueUserIds.map(userId => analyticsService.getFocusAnalytics(userId, days))
    );

    // Aggregate metrics (only PERSONAL data, no SENSITIVE)
    let totalFocusSessionTime = 0;
    let totalSessions = 0;
    let totalTasksCompleted = 0;

    focusData.forEach(data => {
      totalFocusSessionTime += data.totalFocusSessionTime || 0;
      totalSessions += data.focusSessionCount || 0;
      totalTasksCompleted += data.tasksCompletedDuringFocus || 0;
    });

    const averageFocusSessionDuration = totalSessions > 0
      ? totalFocusSessionTime / totalSessions
      : 0;

    const averageTaskCompletionRate = totalSessions > 0
      ? totalTasksCompleted / totalSessions
      : 0;

    return {
      workspaceId,
      teamCount: teams.length,
      teams: teams.map(t => ({ id: t.id, name: t.name })),
      aggregatedMetrics: {
        averageFocusSessionDuration: Math.round(averageFocusSessionDuration * 100) / 100,
        totalFocusSessionTime,
        focusSessionCount: totalSessions,
        totalTasksCompletedDuringFocus: totalTasksCompleted,
        averageTaskCompletionRate: Math.round(averageTaskCompletionRate * 100) / 100
      },
      dataClassification: "PERSONAL",
      note: "Aggregated data across all teams in workspace - individual member data and sensitive metrics (mood, energy, cognitive flow) not shown. Each user's focus sessions are counted only once, even if they're in multiple teams.",
      isAggregated: true
    };
  }

  /**
   * Aggregate focus analytics across all workspaces
   * For admin/owner - combines all workspaces they own
   */
  async aggregateAllWorkspacesFocus(userId: number, days: number = 30): Promise<any> {
    // Get all workspaces owned by user
    const workspaces = await prisma.workspace.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        name: true
      }
    });

    if (workspaces.length === 0) {
      return {
        workspaces: [],
        totalWorkspaces: 0,
        aggregatedMetrics: {
          averageFocusSessionDuration: 0,
          totalFocusSessionTime: 0,
          focusSessionCount: 0,
          totalTasksCompletedDuringFocus: 0,
          averageTaskCompletionRate: 0
        },
        dataClassification: "PERSONAL",
        note: "You don't own any workspaces",
        isAggregated: true
      };
    }

    const workspaceIds = workspaces.map(w => w.id);
    
    // Get all teams in all workspaces
    const teams = await prisma.team.findMany({
      where: {
        workspaceId: { in: workspaceIds }
      },
      select: {
        id: true,
        name: true,
        workspaceId: true
      }
    });

    if (teams.length === 0) {
      return {
        workspaces: workspaces.map(w => ({ id: w.id, name: w.name })),
        totalWorkspaces: workspaces.length,
        aggregatedMetrics: {
          averageFocusSessionDuration: 0,
          totalFocusSessionTime: 0,
          focusSessionCount: 0,
          totalTasksCompletedDuringFocus: 0,
          averageTaskCompletionRate: 0
        },
        dataClassification: "PERSONAL",
        note: "No teams in any workspace",
        isAggregated: true
      };
    }

    const teamIds = teams.map(t => t.id);
    
    // Get all unique members across all teams in all workspaces (deduplicate by userId)
    const allMemberships = await prisma.teamMembership.findMany({
      where: {
        teamId: { in: teamIds },
        status: "ACTIVE"
      },
      select: {
        userId: true
      }
    });

    // Get unique user IDs to avoid counting the same user's focus sessions multiple times
    const uniqueUserIds = [...new Set(allMemberships.map(m => m.userId))];
    
    if (uniqueUserIds.length === 0) {
      return {
        workspaces: workspaces.map(w => ({ id: w.id, name: w.name })),
        totalWorkspaces: workspaces.length,
        aggregatedMetrics: {
          averageFocusSessionDuration: 0,
          totalFocusSessionTime: 0,
          focusSessionCount: 0,
          totalTasksCompletedDuringFocus: 0,
          averageTaskCompletionRate: 0
        },
        dataClassification: "PERSONAL",
        note: "No active team members across all workspaces",
        isAggregated: true
      };
    }

    // Get focus data for each unique user only once
    const focusData = await Promise.all(
      uniqueUserIds.map(userId => analyticsService.getFocusAnalytics(userId, days))
    );

    // Aggregate metrics (only PERSONAL data, no SENSITIVE)
    let totalFocusSessionTime = 0;
    let totalSessions = 0;
    let totalTasksCompleted = 0;

    focusData.forEach(data => {
      totalFocusSessionTime += data.totalFocusSessionTime || 0;
      totalSessions += data.focusSessionCount || 0;
      totalTasksCompleted += data.tasksCompletedDuringFocus || 0;
    });

    const averageFocusSessionDuration = totalSessions > 0
      ? totalFocusSessionTime / totalSessions
      : 0;

    const averageTaskCompletionRate = totalSessions > 0
      ? totalTasksCompleted / totalSessions
      : 0;

    // Group teams by workspace for response
    const teamsByWorkspace = workspaces.map(workspace => ({
      id: workspace.id,
      name: workspace.name,
      teams: teams
        .filter(t => t.workspaceId === workspace.id)
        .map(t => ({ id: t.id, name: t.name }))
    }));

    return {
      workspaces: teamsByWorkspace,
      totalWorkspaces: workspaces.length,
      aggregatedMetrics: {
        averageFocusSessionDuration: Math.round(averageFocusSessionDuration * 100) / 100,
        totalFocusSessionTime,
        focusSessionCount: totalSessions,
        totalTasksCompletedDuringFocus: totalTasksCompleted,
        averageTaskCompletionRate: Math.round(averageTaskCompletionRate * 100) / 100
      },
      dataClassification: "PERSONAL",
      note: "Aggregated data across all workspaces - individual member data and sensitive metrics (mood, energy, cognitive flow) not shown. Each user's focus sessions are counted only once, even if they're in multiple teams across different workspaces.",
      isAggregated: true
    };
  }

  /**
   * Aggregate cognitive load for all teams in a workspace
   * For workspace managers - combines all teams in their workspace
   */
  async aggregateWorkspaceCognitiveLoad(workspaceId: number): Promise<any> {
    // Get all teams in the workspace
    const teams = await prisma.team.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true
      }
    });

    if (teams.length === 0) {
      return {
        workspaceId,
        teamCount: 0,
        aggregatedMetrics: {
          averageWorkloadScore: 0,
          averageBurnoutRisk: 0,
          membersAtRisk: 0,
          membersOptimal: 0,
          membersHeavy: 0,
          totalMemberCount: 0
        },
        dataClassification: "SENSITIVE",
        note: "No teams in this workspace",
        isAggregated: true
      };
    }

    const teamIds = teams.map(t => t.id);
    
    // Get aggregated data for each team
    const teamData = await Promise.all(
      teamIds.map(teamId => this.aggregateTeamCognitiveLoad(teamId))
    );

    // Aggregate across all teams
    let totalWorkloadScore = 0;
    let totalBurnoutRisk = 0;
    let totalMembersAtRisk = 0;
    let totalMembersOptimal = 0;
    let totalMembersHeavy = 0;
    let totalMemberCount = 0;

    teamData.forEach(team => {
      const metrics = team.aggregatedMetrics;
      const memberCount = team.memberCount || 0;
      
      totalWorkloadScore += (metrics.averageWorkloadScore || 0) * memberCount;
      totalBurnoutRisk += (metrics.averageBurnoutRisk || 0) * memberCount;
      totalMembersAtRisk += metrics.membersAtRisk || 0;
      totalMembersOptimal += metrics.membersOptimal || 0;
      totalMembersHeavy += metrics.membersHeavy || 0;
      totalMemberCount += memberCount;
    });

    const averageWorkloadScore = totalMemberCount > 0
      ? Math.round((totalWorkloadScore / totalMemberCount) * 100) / 100
      : 0;
    
    const averageBurnoutRisk = totalMemberCount > 0
      ? Math.round((totalBurnoutRisk / totalMemberCount) * 100) / 100
      : 0;

    return {
      workspaceId,
      teamCount: teams.length,
      teams: teams.map(t => ({ id: t.id, name: t.name })),
      aggregatedMetrics: {
        averageWorkloadScore,
        averageBurnoutRisk,
        membersAtRisk: totalMembersAtRisk,
        membersOptimal: totalMembersOptimal,
        membersHeavy: totalMembersHeavy,
        totalMemberCount
      },
      dataClassification: "SENSITIVE",
      note: "Individual cognitive data not shown for privacy. Only aggregated, anonymized metrics across all teams in workspace.",
      isAggregated: true
    };
  }

  /**
   * Aggregate cognitive load across all workspaces
   * For admin/owner - combines all workspaces they own
   */
  async aggregateAllWorkspacesCognitiveLoad(userId: number): Promise<any> {
    // Get all workspaces owned by user
    const workspaces = await prisma.workspace.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        name: true
      }
    });

    if (workspaces.length === 0) {
      return {
        workspaces: [],
        totalWorkspaces: 0,
        aggregatedMetrics: {
          averageWorkloadScore: 0,
          averageBurnoutRisk: 0,
          membersAtRisk: 0,
          membersOptimal: 0,
          membersHeavy: 0,
          totalMemberCount: 0
        },
        dataClassification: "SENSITIVE",
        note: "You don't own any workspaces",
        isAggregated: true
      };
    }

    const workspaceIds = workspaces.map(w => w.id);
    
    // Get all teams in all workspaces
    const teams = await prisma.team.findMany({
      where: {
        workspaceId: { in: workspaceIds }
      },
      select: {
        id: true,
        name: true,
        workspaceId: true
      }
    });

    if (teams.length === 0) {
      return {
        workspaces: workspaces.map(w => ({ id: w.id, name: w.name })),
        totalWorkspaces: workspaces.length,
        aggregatedMetrics: {
          averageWorkloadScore: 0,
          averageBurnoutRisk: 0,
          membersAtRisk: 0,
          membersOptimal: 0,
          membersHeavy: 0,
          totalMemberCount: 0
        },
        dataClassification: "SENSITIVE",
        note: "No teams in any workspace",
        isAggregated: true
      };
    }

    const teamIds = teams.map(t => t.id);
    
    // Get aggregated data for each team
    const teamData = await Promise.all(
      teamIds.map(teamId => this.aggregateTeamCognitiveLoad(teamId))
    );

    // Aggregate across all teams in all workspaces
    let totalWorkloadScore = 0;
    let totalBurnoutRisk = 0;
    let totalMembersAtRisk = 0;
    let totalMembersOptimal = 0;
    let totalMembersHeavy = 0;
    let totalMemberCount = 0;

    teamData.forEach(team => {
      const metrics = team.aggregatedMetrics;
      const memberCount = team.memberCount || 0;
      
      totalWorkloadScore += (metrics.averageWorkloadScore || 0) * memberCount;
      totalBurnoutRisk += (metrics.averageBurnoutRisk || 0) * memberCount;
      totalMembersAtRisk += metrics.membersAtRisk || 0;
      totalMembersOptimal += metrics.membersOptimal || 0;
      totalMembersHeavy += metrics.membersHeavy || 0;
      totalMemberCount += memberCount;
    });

    const averageWorkloadScore = totalMemberCount > 0
      ? Math.round((totalWorkloadScore / totalMemberCount) * 100) / 100
      : 0;
    
    const averageBurnoutRisk = totalMemberCount > 0
      ? Math.round((totalBurnoutRisk / totalMemberCount) * 100) / 100
      : 0;

    // Group teams by workspace for response
    const teamsByWorkspace = workspaces.map(workspace => ({
      id: workspace.id,
      name: workspace.name,
      teams: teams
        .filter(t => t.workspaceId === workspace.id)
        .map(t => ({ id: t.id, name: t.name }))
    }));

    return {
      workspaces: teamsByWorkspace,
      totalWorkspaces: workspaces.length,
      aggregatedMetrics: {
        averageWorkloadScore,
        averageBurnoutRisk,
        membersAtRisk: totalMembersAtRisk,
        membersOptimal: totalMembersOptimal,
        membersHeavy: totalMembersHeavy,
        totalMemberCount
      },
      dataClassification: "SENSITIVE",
      note: "Individual cognitive data not shown for privacy. Only aggregated, anonymized metrics across all workspaces.",
      isAggregated: true
    };
  }
}

export default new AggregationService();

