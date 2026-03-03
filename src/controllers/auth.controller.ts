import type { Request, Response } from "express";
import * as authService from "../services/auth.service.js";
import { registerSchema, checkAvailabilitySchema } from "../validators/auth.validator.js";
import type { 
  LoginRequest, 
  RegisterRequest,
  ForgotPasswordRequest,
  ResetPasswordRequest,
  CheckAvailabilityRequest
} from "../types/auth.types.js";

const register = async (req: Request<{}, {}, RegisterRequest>, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      const errors = parsed.error.errors.map((e) => e.message).join(". ");
      res.status(400).json({ message: errors });
      return;
    }
    const result = await authService.register(parsed.data);
    res.status(201).json(result);
  } catch (error: any) {
    const status = error.message.includes("already exist") ? 409 : 400;
    res.status(status).json({ message: error.message });
  }
};

const checkAvailability = async (req: Request<{}, {}, CheckAvailabilityRequest>, res: Response) => {
  try {
    const parsed = checkAvailabilitySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid request" });
      return;
    }
    const result = await authService.checkAvailability(parsed.data.field, parsed.data.value);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ message: "Failed to check availability" });
  }
};

const login = async (req: Request<{}, {}, LoginRequest>, res: Response) => {
  try {
    const result = await authService.login(req.body);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(401).json({ message: error.message });
  }
};

const logout = async (req: Request, res: Response) => {
  try {
    const result = await authService.logout();
    res.status(200).json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

const forgotPassword = async (req: Request<{}, {}, ForgotPasswordRequest>, res: Response) => {
  try {
    const result = await authService.forgotPassword(req.body);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

const resetPassword = async (req: Request<{}, {}, ResetPasswordRequest>, res: Response) => {
  try {
    const result = await authService.resetPassword(req.body);
    res.status(200).json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export {
  register,
  checkAvailability,
  login,
  logout,
  forgotPassword,
  resetPassword,
};
