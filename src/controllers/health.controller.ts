import type { Request, Response } from "express";

const getHealth = async (req: Request, res: Response) => {
  try {
    const healthStatus = {
      status: "Healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
    };
    
    res.status(200).json(healthStatus);
  } catch (error: any) {
    res.status(503).json({
      status: "ERROR",
      timestamp: new Date().toISOString(),
      message: error.message
    });
  }
};

export { getHealth };
