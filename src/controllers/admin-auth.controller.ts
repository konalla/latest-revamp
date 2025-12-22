import type { Request, Response } from "express";
import { adminLogin } from "../services/admin-auth.service.js";
import type { LoginRequest } from "../types/auth.types.js";

export class AdminAuthController {
  /**
   * Admin login endpoint
   * POST /api/admin/auth/login
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const data: LoginRequest = req.body;

      if (!data.identifier || !data.password) {
        res.status(400).json({ message: "Email/username and password are required" });
        return;
      }

      const result = await adminLogin(data);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(401).json({ message: error.message || "Login failed" });
    }
  }
}

export const adminAuthController = new AdminAuthController();



