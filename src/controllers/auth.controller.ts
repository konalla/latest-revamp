import type { Request, Response } from "express";
import * as authService from "../services/auth.service";
import type { LoginRequest, RegisterRequest } from "../types/auth.types";

const register = async (req: Request<{}, {}, RegisterRequest>, res: Response) => {
  try {
    const result = await authService.register(req.body);
    res.status(201).json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
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

export {
  register,
  login,
};
