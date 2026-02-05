import prisma from "../../config/prisma.js";
import type { SubscriptionCoreService } from "./subscription-core.service.js";

/**
 * Subscription limits service handling permission checks and usage counters:
 * - canCreate* methods for various resources
 * - increment* methods for usage tracking
 * - reset*IfNeeded methods for billing period resets
 * - hasActiveSubscription, canAddTeamMembers, canPerformWriteOperations
 */
export class SubscriptionLimitsService {
  constructor(private coreService: SubscriptionCoreService) {}

  /**
   * Check if user can create tasks
   */
  async canCreateTask(userId: number): Promise<{
    canCreate: boolean;
    reason?: string;
    tasksRemaining?: number;
    subscription?: any;
  }> {
    try {
      const subscription = await this.coreService.getUserSubscription(userId);

      if (!subscription) {
        return { 
          canCreate: false, 
          reason: "No subscription found. Please choose a subscription plan to continue creating tasks.",
          tasksRemaining: 0
        };
      }

      const updatedSubscription = await this.coreService.updateSubscriptionStatus(subscription.id);

      // Check if subscription is expired (no grace period)
      if (updatedSubscription.status === "EXPIRED") {
        return {
          canCreate: false,
          reason: "Subscription expired. Please renew to continue creating tasks.",
          subscription: updatedSubscription,
        };
      }

      // Check if subscription is canceled (immediate view-only mode)
      if (updatedSubscription.status === "CANCELED") {
        return {
          canCreate: false,
          reason: "Subscription canceled. Please renew to continue creating tasks.",
          subscription: updatedSubscription,
        };
      }

      // Check if plan has unlimited tasks (focus_master or performance_founder)
      const planName = updatedSubscription.subscriptionPlan?.name;
      const hasUnlimitedTasks = planName === "focus_master" || planName === "performance_founder";
      
      // If unlimited tasks, skip task limit checks
      if (hasUnlimitedTasks) {
        return {
          canCreate: true,
          // tasksRemaining is optional, omit it to indicate unlimited
          subscription: updatedSubscription,
        };
      }

      // Check if in grace period (can create during grace period)
      if (updatedSubscription.status === "GRACE_PERIOD") {
        // Reset task count if needed
        await this.resetTaskCountIfNeeded(updatedSubscription.id);
        const sub = await prisma.subscription.findUnique({
          where: { id: updatedSubscription.id },
        });

        const maxTasks = updatedSubscription.subscriptionPlan.maxTasks || 0;
        const tasksRemaining = maxTasks - (sub?.tasksCreatedThisPeriod || 0);

        if (tasksRemaining <= 0) {
          return {
            canCreate: false,
            reason: "Task limit reached for this billing period.",
            tasksRemaining: 0,
            subscription: updatedSubscription,
          };
        }

        return {
          canCreate: true,
          tasksRemaining,
          subscription: updatedSubscription,
        };
      }

      // Check task limits
      await this.resetTaskCountIfNeeded(updatedSubscription.id);
      const sub = await prisma.subscription.findUnique({
        where: { id: updatedSubscription.id },
      });

      const maxTasks = updatedSubscription.subscriptionPlan.maxTasks || 0;
      const tasksRemaining = maxTasks - (sub?.tasksCreatedThisPeriod || 0);

      if (tasksRemaining <= 0) {
        return {
          canCreate: false,
          reason: "Task limit reached for this billing period.",
          tasksRemaining: 0,
          subscription: updatedSubscription,
        };
      }

      return {
        canCreate: true,
        tasksRemaining,
        subscription: updatedSubscription,
      };
    } catch (error: any) {
      console.error("Error checking task creation permission:", error);
      return { canCreate: false, reason: "Error checking subscription status" };
    }
  }

  /**
   * Increment task count when task is created
   */
  async incrementTaskCount(userId: number): Promise<void> {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { userId },
      });

      if (!subscription) {
        return;
      }

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          tasksCreatedThisPeriod: {
            increment: 1,
          },
        },
      });

      // Check if trial should end due to task limit
      if (subscription.status === "TRIAL") {
        const updatedSub = await prisma.subscription.findUnique({
          where: { id: subscription.id },
          include: { subscriptionPlan: true },
        });

        if (
          updatedSub &&
          updatedSub.subscriptionPlan.maxTasks &&
          updatedSub.tasksCreatedThisPeriod >= updatedSub.subscriptionPlan.maxTasks
        ) {
          // End trial immediately
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: { status: "EXPIRED" },
          });
        }
      }
    } catch (error: any) {
      console.error("Error incrementing task count:", error);
    }
  }

  /**
   * Reset task count if billing period changed
   */
  async resetTaskCountIfNeeded(subscriptionId: number): Promise<void> {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: { subscriptionPlan: true },
      });

      if (!subscription || !subscription.currentPeriodStart) {
        return;
      }

      const now = new Date();
      const lastReset = subscription.lastTaskCountReset || subscription.currentPeriodStart;

      // Check if we need to reset based on billing interval
      let shouldReset = false;

      if (subscription.subscriptionPlan.billingInterval === "monthly") {
        // Reset if a month has passed since last reset
        const nextReset = new Date(lastReset);
        nextReset.setMonth(nextReset.getMonth() + 1);
        if (now >= nextReset) {
          shouldReset = true;
        }
      } else if (subscription.subscriptionPlan.billingInterval === "yearly") {
        // Reset if a year has passed since last reset
        const nextReset = new Date(lastReset);
        nextReset.setFullYear(nextReset.getFullYear() + 1);
        if (now >= nextReset) {
          shouldReset = true;
        }
      } else if (subscription.subscriptionPlan.billingInterval === "free") {
        // For free plan, reset monthly based on subscription start date
        const lastCountReset = subscription.lastCountReset || subscription.currentPeriodStart;
        const nextReset = new Date(lastCountReset);
        nextReset.setMonth(nextReset.getMonth() + 1);
        if (now >= nextReset) {
          shouldReset = true;
        }
      }

      if (shouldReset) {
        await prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            tasksCreatedThisPeriod: 0,
            lastTaskCountReset: now,
          },
        });
      }
    } catch (error: any) {
      console.error("Error resetting task count:", error);
    }
  }

  /**
   * Reset all counters if billing period changed (for free plan monthly renewal)
   */
  async resetAllCountersIfNeeded(subscriptionId: number): Promise<void> {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: { subscriptionPlan: true },
      });

      if (!subscription || !subscription.currentPeriodStart) {
        return;
      }

      const now = new Date();
      const lastReset = subscription.lastCountReset || subscription.currentPeriodStart;

      // Check if we need to reset based on billing interval
      let shouldReset = false;
      let newPeriodEnd: Date | null = null;

      if (subscription.subscriptionPlan.billingInterval === "free" || 
          subscription.subscriptionPlan.billingInterval === "monthly") {
        // Reset if a month has passed since last reset
        const nextReset = new Date(lastReset);
        nextReset.setMonth(nextReset.getMonth() + 1);
        if (now >= nextReset) {
          shouldReset = true;
          // Set new period end (one month from now)
          newPeriodEnd = new Date(now);
          newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
        }
      } else if (subscription.subscriptionPlan.billingInterval === "yearly") {
        // Reset if a year has passed since last reset
        const nextReset = new Date(lastReset);
        nextReset.setFullYear(nextReset.getFullYear() + 1);
        if (now >= nextReset) {
          shouldReset = true;
          // Set new period end (one year from now)
          newPeriodEnd = new Date(now);
          newPeriodEnd.setFullYear(newPeriodEnd.getFullYear() + 1);
        }
      }

      if (shouldReset) {
        await prisma.subscription.update({
          where: { id: subscriptionId },
          data: {
            tasksCreatedThisPeriod: 0,
            projectsCreatedThisPeriod: 0,
            objectivesCreatedThisPeriod: 0,
            keyResultsCreatedThisPeriod: 0,
            workspacesCreatedThisPeriod: 0,
            teamsCreatedThisPeriod: 0,
            lastTaskCountReset: now,
            lastCountReset: now,
            currentPeriodStart: now,
            currentPeriodEnd: newPeriodEnd,
          },
        });
      }
    } catch (error: any) {
      console.error("Error resetting all counters:", error);
    }
  }

  /**
   * Check if user can create projects
   */
  async canCreateProject(userId: number): Promise<{
    canCreate: boolean;
    reason?: string;
    projectsRemaining?: number;
    subscription?: any;
  }> {
    try {
      const subscription = await this.coreService.getUserSubscription(userId);
      
      // Handle null subscription - user needs to choose a plan
      if (!subscription) {
        return { 
          canCreate: false, 
          reason: "No subscription found. Please choose a subscription plan to continue.",
          projectsRemaining: 0
        };
      }
      
      // Reset counters if needed
      await this.resetAllCountersIfNeeded(subscription.id);
      const sub = await prisma.subscription.findUnique({
        where: { id: subscription.id },
      });

      if (!sub || !subscription.subscriptionPlan) {
        return { canCreate: false, reason: "No active subscription found" };
      }

      const maxProjects = subscription.subscriptionPlan.maxProjects;
      
      // If maxProjects is null, unlimited
      if (maxProjects === null) {
        return {
          canCreate: true,
          subscription: subscription,
        };
      }

      const projectsRemaining = maxProjects - (sub.projectsCreatedThisPeriod || 0);

      if (projectsRemaining <= 0) {
        return {
          canCreate: false,
          reason: "Project limit reached for this billing period.",
          projectsRemaining: 0,
          subscription: subscription,
        };
      }

      return {
        canCreate: true,
        projectsRemaining,
        subscription: subscription,
      };
    } catch (error: any) {
      console.error("Error checking project creation permission:", error);
      return { canCreate: false, reason: "Error checking subscription status" };
    }
  }

  /**
   * Check if user can create objectives
   */
  async canCreateObjective(userId: number): Promise<{
    canCreate: boolean;
    reason?: string;
    objectivesRemaining?: number;
    subscription?: any;
  }> {
    try {
      const subscription = await this.coreService.getUserSubscription(userId);
      
      // Handle null subscription - user needs to choose a plan
      if (!subscription) {
        return { 
          canCreate: false, 
          reason: "No subscription found. Please choose a subscription plan to continue.",
          objectivesRemaining: 0
        };
      }
      
      // Reset counters if needed
      await this.resetAllCountersIfNeeded(subscription.id);
      const sub = await prisma.subscription.findUnique({
        where: { id: subscription.id },
      });

      if (!sub || !subscription.subscriptionPlan) {
        return { canCreate: false, reason: "No active subscription found" };
      }

      const maxObjectives = subscription.subscriptionPlan.maxObjectives;
      
      // If maxObjectives is null, unlimited
      if (maxObjectives === null) {
        return {
          canCreate: true,
          subscription: subscription,
        };
      }

      const objectivesRemaining = maxObjectives - (sub.objectivesCreatedThisPeriod || 0);

      if (objectivesRemaining <= 0) {
        return {
          canCreate: false,
          reason: "Objective limit reached for this billing period.",
          objectivesRemaining: 0,
          subscription: subscription,
        };
      }

      return {
        canCreate: true,
        objectivesRemaining,
        subscription: subscription,
      };
    } catch (error: any) {
      console.error("Error checking objective creation permission:", error);
      return { canCreate: false, reason: "Error checking subscription status" };
    }
  }

  /**
   * Check if user can create key results
   */
  async canCreateKeyResult(userId: number): Promise<{
    canCreate: boolean;
    reason?: string;
    keyResultsRemaining?: number;
    subscription?: any;
  }> {
    try {
      const subscription = await this.coreService.getUserSubscription(userId);
      
      // Handle null subscription - user needs to choose a plan
      if (!subscription) {
        return { 
          canCreate: false, 
          reason: "No subscription found. Please choose a subscription plan to continue.",
          keyResultsRemaining: 0
        };
      }
      
      // Reset counters if needed
      await this.resetAllCountersIfNeeded(subscription.id);
      const sub = await prisma.subscription.findUnique({
        where: { id: subscription.id },
      });

      if (!sub || !subscription.subscriptionPlan) {
        return { canCreate: false, reason: "No active subscription found" };
      }

      const maxKeyResults = subscription.subscriptionPlan.maxKeyResults;
      
      // If maxKeyResults is null, unlimited
      if (maxKeyResults === null) {
        return {
          canCreate: true,
          subscription: subscription,
        };
      }

      const keyResultsRemaining = maxKeyResults - (sub.keyResultsCreatedThisPeriod || 0);

      if (keyResultsRemaining <= 0) {
        return {
          canCreate: false,
          reason: "Key result limit reached for this billing period.",
          keyResultsRemaining: 0,
          subscription: subscription,
        };
      }

      return {
        canCreate: true,
        keyResultsRemaining,
        subscription: subscription,
      };
    } catch (error: any) {
      console.error("Error checking key result creation permission:", error);
      return { canCreate: false, reason: "Error checking subscription status" };
    }
  }

  /**
   * Increment project count when project is created
   */
  async incrementProjectCount(userId: number): Promise<void> {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { userId },
      });

      if (!subscription) {
        return;
      }

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          projectsCreatedThisPeriod: {
            increment: 1,
          },
        },
      });
    } catch (error: any) {
      console.error("Error incrementing project count:", error);
    }
  }

  /**
   * Increment objective count when objective is created
   */
  async incrementObjectiveCount(userId: number): Promise<void> {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { userId },
      });

      if (!subscription) {
        return;
      }

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          objectivesCreatedThisPeriod: {
            increment: 1,
          },
        },
      });
    } catch (error: any) {
      console.error("Error incrementing objective count:", error);
    }
  }

  /**
   * Increment key result count when key result is created
   */
  async incrementKeyResultCount(userId: number): Promise<void> {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { userId },
      });

      if (!subscription) {
        return;
      }

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          keyResultsCreatedThisPeriod: {
            increment: 1,
          },
        },
      });
    } catch (error: any) {
      console.error("Error incrementing key result count:", error);
    }
  }

  /**
   * Increment workspace count when workspace is created
   */
  async incrementWorkspaceCount(userId: number): Promise<void> {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { userId },
      });

      if (!subscription) {
        return;
      }

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          workspacesCreatedThisPeriod: {
            increment: 1,
          },
        },
      });
    } catch (error: any) {
      console.error("Error incrementing workspace count:", error);
    }
  }

  /**
   * Increment team count when team is created
   */
  async incrementTeamCount(userId: number): Promise<void> {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { userId },
      });

      if (!subscription) {
        return;
      }

      await prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          teamsCreatedThisPeriod: {
            increment: 1,
          },
        },
      });
    } catch (error: any) {
      console.error("Error incrementing team count:", error);
    }
  }

  /**
   * Check if user can add team members
   * User must have ACTIVE subscription (not trial, expired, or canceled)
   */
  async canAddTeamMembers(userId: number): Promise<{
    canAdd: boolean;
    reason?: string;
    subscription?: any;
  }> {
    try {
      const subscription = await this.coreService.getUserSubscription(userId);
      
      // If no subscription exists, user needs to choose a plan
      if (!subscription) {
        return {
          canAdd: false,
          reason: "No subscription found. Please choose a subscription plan to add team members.",
          subscription: null,
        };
      }
      
      const updatedSubscription = await this.coreService.updateSubscriptionStatus(subscription.id);

      // Only allow adding team members if subscription is ACTIVE
      if (updatedSubscription.status !== "ACTIVE") {
        return {
          canAdd: false,
          reason: updatedSubscription.status === "TRIAL" 
            ? "Team members can only be added with an active subscription. Trial users cannot add team members."
            : updatedSubscription.status === "GRACE_PERIOD"
            ? "Team members can only be added with an active subscription. Please renew your subscription."
            : "Team members can only be added with an active subscription. Please subscribe to continue.",
          subscription: updatedSubscription,
        };
      }

      return {
        canAdd: true,
        subscription: updatedSubscription,
      };
    } catch (error: any) {
      console.error("Error checking team member addition permission:", error);
      return { canAdd: false, reason: "Error checking subscription status" };
    }
  }

  /**
   * Check if a user has an active subscription (not trial or expired)
   * Used to check if a user can be added to a team
   */
  async hasActiveSubscription(userId: number): Promise<{
    hasActive: boolean;
    reason?: string;
    subscription?: any;
  }> {
    try {
      const subscription = await this.coreService.getUserSubscription(userId);
      
      // If no subscription exists, user doesn't have active subscription
      if (!subscription) {
        return {
          hasActive: false,
          reason: "No subscription found. User must subscribe to join a team.",
          subscription: null,
        };
      }
      
      const updatedSubscription = await this.coreService.updateSubscriptionStatus(subscription.id);

      // Only ACTIVE status is considered active subscription
      if (updatedSubscription.status !== "ACTIVE") {
        return {
          hasActive: false,
          reason: updatedSubscription.status === "TRIAL"
            ? "User must have an active subscription (not trial) to be added to a team"
            : updatedSubscription.status === "EXPIRED"
            ? "User's subscription has expired. They must subscribe to join a team."
            : updatedSubscription.status === "CANCELED"
            ? "User's subscription has been canceled. They must subscribe to join a team."
            : updatedSubscription.status === "GRACE_PERIOD"
            ? "User's subscription has expired. They must renew to join a team."
            : "User must have an active subscription to join a team",
          subscription: updatedSubscription,
        };
      }

      return {
        hasActive: true,
        subscription: updatedSubscription,
      };
    } catch (error: any) {
      console.error("Error checking active subscription:", error);
      return { hasActive: false, reason: "Error checking subscription status" };
    }
  }

  /**
   * Check if user can perform write operations (create/edit/delete)
   */
  async canPerformWriteOperations(userId: number): Promise<{
    canWrite: boolean;
    reason?: string;
    subscription?: any;
  }> {
    try {
      const subscription = await this.coreService.getUserSubscription(userId);
      
      // If no subscription exists, user needs to choose a plan
      if (!subscription) {
        return {
          canWrite: false,
          reason: "No subscription found. Please choose a subscription plan to continue.",
          subscription: null,
        };
      }
      
      const updatedSubscription = await this.coreService.updateSubscriptionStatus(subscription.id);

      // If expired (after grace period), can only view
      if (updatedSubscription.status === "EXPIRED") {
        return {
          canWrite: false,
          reason: "Subscription expired. Please renew to continue using the app.",
          subscription: updatedSubscription,
        };
      }

      // If canceled, immediately enter view-only mode (per requirement)
      if (updatedSubscription.status === "CANCELED") {
        return {
          canWrite: false,
          reason: "Subscription canceled. Please renew to continue using the app.",
          subscription: updatedSubscription,
        };
      }

      // All other statuses (TRIAL, ACTIVE, GRACE_PERIOD) allow write operations
      return {
        canWrite: true,
        subscription: updatedSubscription,
      };
    } catch (error: any) {
      console.error("Error checking write permissions:", error);
      return { canWrite: false, reason: "Error checking subscription status" };
    }
  }
}
