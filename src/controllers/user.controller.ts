import type { Request, Response } from "express";
import * as userService from "../services/user.service.js";
import type { CreateUserRequest } from "../types/user.types.js";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import prisma from "../config/prisma.js";
import { walletService } from "../services/wallet.service.js";
import { statusAssignmentService } from "../services/status-assignment.service.js";

const createUser = async (req: Request<{}, {}, CreateUserRequest>, res: Response) => {
  try {
    const user = await userService.createUser(req.body);
    res.status(201).json(user);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const getUsers = async (req: Request, res: Response) => {
  const users = await userService.getAllUsers();
  res.json(users);
};

const getUser = async (req: Request, res: Response) => {
  const user = await userService.getUserById(parseInt(req.params.id!));
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(user);
};

const updateUser = async (req: Request, res: Response) => {
  try {
    const user = await userService.updateUser(parseInt(req.params.id!), req.body);
    res.json(user);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const deleteUser = async (req: Request, res: Response) => {
  try {
    await userService.deleteUser(parseInt(req.params.id!));
    res.json({ message: "User deleted successfully" });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const getCurrentUser = async (req: Request, res: Response) => {
  try {
    // req.user is available from JWT middleware
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }
    
    const user = await userService.getUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Don't return password
    const { password, ...userWithoutPassword } = user;
    
    // Get referral status for badge information
    let referralStatus = await prisma.userReferralStatus.findUnique({
      where: { userId: user.id },
      select: {
        earlyAccessStatus: true,
        originId: true,
        vanguardId: true,
      },
    });
    
    // Safety net: if user doesn't have the Origin badge, check if they deserve one.
    // Covers missed webhook scenarios (e.g. webhook failed, payment record missing).
    if (!referralStatus || referralStatus.earlyAccessStatus === "NONE") {
      try {
        let shouldAssignBadge = false;

        // Check 1: explicit payment record with amount > 0
        const hasSuccessfulPayment = await prisma.payment.findFirst({
          where: {
            subscription: { userId: user.id },
            status: "succeeded",
            amount: { gt: 0 },
          },
        });

        if (hasSuccessfulPayment) {
          shouldAssignBadge = true;
        }

        // Check 2: active subscription that went through a trial period
        // (status=ACTIVE + trialStart set means the trial ended and payment succeeded,
        // even if the payment record is missing from the database)
        if (!shouldAssignBadge) {
          const activeSubscription = await prisma.subscription.findUnique({
            where: { userId: user.id },
          });

          if (
            activeSubscription &&
            activeSubscription.status === "ACTIVE" &&
            activeSubscription.trialStart
          ) {
            shouldAssignBadge = true;
          }
        }

        if (shouldAssignBadge) {
          console.log(`[Badge Safety Net] User ${user.id} has paid but no Origin badge, assigning now...`);
          const result = await statusAssignmentService.assignOriginStatus(user.id);
          if (result.success) {
            console.log(`[Badge Safety Net] Origin badge assigned to user ${user.id}: ${result.message}`);
            referralStatus = await prisma.userReferralStatus.findUnique({
              where: { userId: user.id },
              select: {
                earlyAccessStatus: true,
                originId: true,
                vanguardId: true,
              },
            });
          }
        }
      } catch (err) {
        console.error(`[Badge Safety Net] Error checking/assigning badge for user ${user.id}:`, err);
      }
    }
    
    // Get wallet balance
    const wallet = await walletService.getWallet(user.id);
    
    // Add default language, badge info, and wallet balance
    const response = {
      ...userWithoutPassword,
      language: "english",
      badge: referralStatus ? {
        status: referralStatus.earlyAccessStatus.toLowerCase(),
        originId: referralStatus.originId,
        vanguardId: referralStatus.vanguardId,
      } : null,
      wallet: {
        balance: wallet.balance,
        totalEarned: wallet.totalEarned,
      },
    };
    
    res.json(response);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const changePassword = async (req: Request, res: Response) => {
  try {
    // req.user is available from JWT middleware
    if (!req.user) {
      return res.status(401).json({ message: "User not authenticated" });
    }
    
    const result = await userService.changePassword(req.user.userId, req.body);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
};

const uploadProfilePhoto = async (req: Request, res: Response) => {
  try {
    // req.user is available from JWT middleware
    if (!req.user) {
      return res.status(401).json({ 
        success: false, 
        message: "User not authenticated" 
      });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: "No file uploaded" 
      });
    }

    // Ensure uploads directory exists
    const uploadsDir = path.join(process.cwd(), "uploads", "profile");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Generate unique filename
    const userId = req.user.userId;
    const timestamp = Date.now();
    const filename = `profile_${userId}_${timestamp}.jpg`;
    const filePath = path.join(uploadsDir, filename);

    // Process image: resize, compress, and convert to JPEG
    await sharp(req.file.buffer)
      .resize(800, 800, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ 
        quality: 80,
        mozjpeg: true 
      })
      .toFile(filePath);

    // Generate the photo URL path
    const photoUrl = `/uploads/profile/${filename}`;
    
    // Update user profile photo URL in database
    const updatedUser = await userService.updateProfilePhoto(req.user.userId, photoUrl);

    // Return success response
    res.status(200).json({
      success: true,
      photoUrl: photoUrl,
      user: updatedUser
    });
  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      message: error.message || "Failed to upload profile photo" 
    });
  }
};

export {
  createUser,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  getCurrentUser,
  changePassword,
  uploadProfilePhoto,
};